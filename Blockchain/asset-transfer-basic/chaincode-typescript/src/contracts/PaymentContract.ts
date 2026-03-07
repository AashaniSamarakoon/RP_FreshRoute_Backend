import { Context, Transaction, Info } from 'fabric-contract-api';
import { BaseContract } from './BaseContract';

/**
 * PaymentContract — tracks all payment lifecycle events on the immutable ledger.
 *
 * Two payment paths share most of the same state machine:
 *
 *  PAY_NOW (direct PayHere):
 *    InitiatePayment → AuthorizePayment → ReleasePayment → ConfirmPaymentRelease
 *
 *  PAY_LATER (preapproval + auto-charge):
 *    RecordPreapproval → RecordPreapprovalToken → RecordAutoCharge → ReleasePayment → ConfirmPaymentRelease
 *
 *  Either path can end in: RefundPayment → ConfirmRefund
 */
@Info({ title: 'PaymentContract', description: 'PayHere payment lifecycle — both PAY_NOW and PAY_LATER flows' })
export class PaymentContract extends BaseContract {

    constructor() { super('PaymentContract'); }

    // ─────────────────────────────────────────────────────────────
    //  PAY_NOW FLOW
    // ─────────────────────────────────────────────────────────────

    /**
     * InitiatePayment — buyer starts a direct (PAY_NOW) PayHere payment.
     * Called from backend when buyer submits payment form.
     */
    @Transaction()
    async InitiatePayment(ctx: Context, orderId: string, amount: string, paymentMethod: string): Promise<void> {
        const client = this.getClient(ctx);
        if (client.role !== 'buyer') throw new Error('Only buyers can initiate payments');

        const orderData = await ctx.stub.getState(orderId);
        if (!orderData || orderData.length === 0) throw new Error(`Order ${orderId} not found`);
        const order = JSON.parse(orderData.toString());

        if (order.buyerId !== client.id) throw new Error('Unauthorized: Order does not belong to this buyer');
        if (order.status !== 'CONFIRMED') throw new Error('Cannot initiate payment for unconfirmed orders');

        const existing = await ctx.stub.getState(`PAYMENT_${orderId}`);
        if (existing && existing.length > 0) throw new Error(`Payment record already exists for order ${orderId}`);

        const txTimestamp = ctx.stub.getTxTimestamp();
        const now = new Date(Number(txTimestamp.seconds) * 1000).toISOString();

        const payment = {
            id: `PAYMENT_${orderId}`,
            docType: 'payment',
            orderId,
            buyerId: order.buyerId,
            sellerId: order.sellerId,
            amount: parseFloat(amount),
            paymentMethod,          // e.g. 'PAYHERE', 'CARD'
            status: 'PENDING',
            initiatedAt: now,
            createdAt: now,
            updatedAt: now,
        };

        order.paymentStatus = 'PENDING';
        order.updatedAt = now;

        await ctx.stub.putState(`PAYMENT_${orderId}`, Buffer.from(JSON.stringify(payment)));
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    /**
     * AuthorizePayment — PayHere IPN confirms payment was captured (money held).
     * Called from backend notify webhook for PAY_NOW orders.
     */
    @Transaction()
    async AuthorizePayment(ctx: Context, orderId: string, payherePaymentId: string): Promise<void> {
        const paymentData = await ctx.stub.getState(`PAYMENT_${orderId}`);
        if (!paymentData || paymentData.length === 0) throw new Error(`Payment for order ${orderId} not found`);
        const payment = JSON.parse(paymentData.toString());

        if (payment.status !== 'PENDING') throw new Error('Can only authorize a PENDING payment');

        const orderData = await ctx.stub.getState(orderId);
        const order = JSON.parse(orderData.toString());

        const txTimestamp = ctx.stub.getTxTimestamp();
        const now = new Date(Number(txTimestamp.seconds) * 1000).toISOString();

        payment.status = 'AUTHORIZED';
        payment.payherePaymentId = payherePaymentId;
        payment.authorizedAt = now;
        payment.updatedAt = now;

        order.paymentStatus = 'AUTHORIZED';
        order.status = 'PAID_PENDING_DELIVERY';
        order.updatedAt = now;

        await ctx.stub.putState(`PAYMENT_${orderId}`, Buffer.from(JSON.stringify(payment)));
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    // ─────────────────────────────────────────────────────────────
    //  PAY_LATER FLOW (PayHere preapproval + auto-charge)
    // ─────────────────────────────────────────────────────────────

    /**
     * RecordPreapproval — buyer clicks "Pay Later"; records the intent and scheduled
     * charge date on the immutable ledger. Called from preapprovalInit backend endpoint.
     */
    @Transaction()
    async RecordPreapproval(ctx: Context, orderId: string, amount: string, autoChargeDate: string): Promise<void> {
        const client = this.getClient(ctx);
        if (client.role !== 'buyer') throw new Error('Only buyers can initiate pre-approvals');

        const orderData = await ctx.stub.getState(orderId);
        if (!orderData || orderData.length === 0) throw new Error(`Order ${orderId} not found`);
        const order = JSON.parse(orderData.toString());

        if (order.buyerId !== client.id) throw new Error('Unauthorized: Order does not belong to this buyer');
        if (order.status !== 'CONFIRMED') throw new Error('Order must be confirmed before pre-approval');

        const existing = await ctx.stub.getState(`PAYMENT_${orderId}`);
        if (existing && existing.length > 0) throw new Error(`Payment record already exists for order ${orderId}`);

        const txTimestamp = ctx.stub.getTxTimestamp();
        const now = new Date(Number(txTimestamp.seconds) * 1000).toISOString();

        const payment = {
            id: `PAYMENT_${orderId}`,
            docType: 'payment',
            orderId,
            buyerId: order.buyerId,
            sellerId: order.sellerId,
            amount: parseFloat(amount),
            paymentMethod: 'PAY_LATER',
            status: 'PREAPPROVAL_INITIATED',
            autoChargeDate,
            preapprovalInitiatedAt: now,
            createdAt: now,
            updatedAt: now,
        };

        order.paymentStatus = 'PREAPPROVAL_INITIATED';
        order.updatedAt = now;

        await ctx.stub.putState(`PAYMENT_${orderId}`, Buffer.from(JSON.stringify(payment)));
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    /**
     * RecordPreapprovalToken — PayHere IPN confirms buyer's card/account was
     * pre-approved (customer_token issued). Records the PayHere payment ID as
     * on-chain proof — the customer_token itself stays in the backend DB only.
     * Called from preapprovalNotify backend endpoint.
     */
    @Transaction()
    async RecordPreapprovalToken(ctx: Context, orderId: string, payherePaymentId: string): Promise<void> {
        const paymentData = await ctx.stub.getState(`PAYMENT_${orderId}`);
        if (!paymentData || paymentData.length === 0) throw new Error(`Payment for order ${orderId} not found`);
        const payment = JSON.parse(paymentData.toString());

        if (payment.paymentMethod !== 'PAY_LATER') throw new Error('Not a PAY_LATER payment');
        if (payment.status !== 'PREAPPROVAL_INITIATED') throw new Error('Pre-approval has not been initiated');

        const orderData = await ctx.stub.getState(orderId);
        const order = JSON.parse(orderData.toString());

        const txTimestamp = ctx.stub.getTxTimestamp();
        const now = new Date(Number(txTimestamp.seconds) * 1000).toISOString();

        payment.status = 'PREAPPROVED';
        payment.payherePaymentId = payherePaymentId;  // IPN payment_id (not customer_token)
        payment.preapprovedAt = now;
        payment.updatedAt = now;

        // Move order to the same waiting-for-delivery state as a direct payment
        order.paymentStatus = 'PREAPPROVED';
        order.status = 'PAID_PENDING_DELIVERY';
        order.updatedAt = now;

        await ctx.stub.putState(`PAYMENT_${orderId}`, Buffer.from(JSON.stringify(payment)));
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    /**
     * RecordAutoCharge — the auto-charge cron successfully charged the buyer on
     * delivery date. This is the PAY_LATER equivalent of AuthorizePayment.
     * Called from payhereChargeService.runDailyAutoCharge.
     */
    @Transaction()
    async RecordAutoCharge(ctx: Context, orderId: string, chargeId: string, chargedAmount: string): Promise<void> {
        const paymentData = await ctx.stub.getState(`PAYMENT_${orderId}`);
        if (!paymentData || paymentData.length === 0) throw new Error(`Payment for order ${orderId} not found`);
        const payment = JSON.parse(paymentData.toString());

        if (payment.paymentMethod !== 'PAY_LATER') throw new Error('Not a PAY_LATER payment');
        if (payment.status !== 'PREAPPROVED') throw new Error('Payment must be pre-approved before auto-charge');

        const orderData = await ctx.stub.getState(orderId);
        const order = JSON.parse(orderData.toString());

        const txTimestamp = ctx.stub.getTxTimestamp();
        const now = new Date(Number(txTimestamp.seconds) * 1000).toISOString();

        // After auto-charge the payment is AUTHORIZED — same state as PAY_NOW after AuthorizePayment.
        // This means ReleasePayment and ConfirmPaymentRelease work identically for both flows.
        payment.status = 'AUTHORIZED';
        payment.chargeId = chargeId;
        payment.chargedAmount = parseFloat(chargedAmount);
        payment.chargedAt = now;
        payment.authorizedAt = now;     // Aligned with PAY_NOW field name
        payment.updatedAt = now;

        order.paymentStatus = 'AUTHORIZED';
        order.updatedAt = now;

        await ctx.stub.putState(`PAYMENT_${orderId}`, Buffer.from(JSON.stringify(payment)));
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    // ─────────────────────────────────────────────────────────────
    //  SHARED — applies to both PAY_NOW and PAY_LATER after AUTHORIZED
    // ─────────────────────────────────────────────────────────────

    /**
     * ReleasePayment — transporter confirms quality at pickup and authorises
     * the payment to be captured/released to the farmer.
     * Called from deliveryController.confirmQualityAndPickup.
     */
    @Transaction()
    async ReleasePayment(
        ctx: Context,
        orderId: string,
        transporterId: string,
        farmerShareAmount: string,      // farmer's base price at acceptance
        transporterFeeAmount: string,   // delivery fee at acceptance
        platformFeeAmount: string       // service charge at acceptance
    ): Promise<void> {
        const client = this.getClient(ctx);
        if (client.role !== 'transporter') throw new Error('Only transporters can release payments after quality check');

        const paymentData = await ctx.stub.getState(`PAYMENT_${orderId}`);
        if (!paymentData || paymentData.length === 0) throw new Error(`Payment for order ${orderId} not found`);
        const payment = JSON.parse(paymentData.toString());

        const orderData = await ctx.stub.getState(orderId);
        const order = JSON.parse(orderData.toString());

        if (order.transporterId !== transporterId) throw new Error('Unauthorized: You are not assigned to this order');

        if (order.status !== 'PAID_PENDING_DELIVERY' && order.status !== 'IN_TRANSIT') {
            throw new Error('Cannot release payment — order must be in PAID_PENDING_DELIVERY or IN_TRANSIT');
        }
        if (payment.status !== 'AUTHORIZED') throw new Error('Payment is not yet authorized');

        const txTimestamp = ctx.stub.getTxTimestamp();
        const now = new Date(Number(txTimestamp.seconds) * 1000).toISOString();

        payment.status = 'PENDING_RELEASE';
        payment.qualityConfirmedBy = transporterId;
        payment.qualityConfirmedAt = now;
        payment.farmerShareAmount    = parseFloat(farmerShareAmount    || '0');
        payment.transporterFeeAmount = parseFloat(transporterFeeAmount || '0');
        payment.platformFeeAmount    = parseFloat(platformFeeAmount    || '0');
        payment.updatedAt = now;

        order.paymentStatus = 'PENDING_RELEASE';
        order.status = 'PICKED_UP';
        order.qualityConfirmedAt = now;
        order.updatedAt = now;

        await ctx.stub.putState(`PAYMENT_${orderId}`, Buffer.from(JSON.stringify(payment)));
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    /**
     * ConfirmPaymentRelease — PayHere capture API succeeded; money released to farmer.
     * Called from backend after successful PayHere capture call.
     */
    @Transaction()
    async ConfirmPaymentRelease(ctx: Context, orderId: string, captureId: string): Promise<void> {
        const paymentData = await ctx.stub.getState(`PAYMENT_${orderId}`);
        if (!paymentData || paymentData.length === 0) throw new Error(`Payment for order ${orderId} not found`);
        const payment = JSON.parse(paymentData.toString());

        const orderData = await ctx.stub.getState(orderId);
        const order = JSON.parse(orderData.toString());

        if (payment.status !== 'PENDING_RELEASE') throw new Error('Payment is not pending release');

        const txTimestamp = ctx.stub.getTxTimestamp();
        const now = new Date(Number(txTimestamp.seconds) * 1000).toISOString();

        payment.status = 'RELEASED';
        payment.captureId = captureId;
        payment.releasedAt = now;
        payment.updatedAt = now;

        order.paymentStatus = 'RELEASED';
        order.status = 'COMPLETED';
        order.updatedAt = now;

        await ctx.stub.putState(`PAYMENT_${orderId}`, Buffer.from(JSON.stringify(payment)));
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    /**
     * RefundPayment — marks a payment for refund. Actual void/refund is processed
     * by the PayHere API in the backend; this records the intent on the ledger.
     */
    @Transaction()
    async RefundPayment(ctx: Context, orderId: string, reason: string): Promise<void> {
        const paymentData = await ctx.stub.getState(`PAYMENT_${orderId}`);
        if (!paymentData || paymentData.length === 0) throw new Error(`Payment for order ${orderId} not found`);
        const payment = JSON.parse(paymentData.toString());

        const orderData = await ctx.stub.getState(orderId);
        const order = JSON.parse(orderData.toString());

        // Allow refund from AUTHORIZED or PENDING_RELEASE; for PAY_LATER also PREAPPROVED
        const refundableStates = ['AUTHORIZED', 'PENDING_RELEASE', 'PREAPPROVED'];
        if (!refundableStates.includes(payment.status)) {
            throw new Error(`Cannot refund payment with status: ${payment.status}`);
        }

        const txTimestamp = ctx.stub.getTxTimestamp();
        const now = new Date(Number(txTimestamp.seconds) * 1000).toISOString();

        payment.status = 'PENDING_REFUND';
        payment.refundReason = reason;
        payment.refundInitiatedAt = now;
        payment.updatedAt = now;

        order.paymentStatus = 'PENDING_REFUND';
        order.updatedAt = now;

        await ctx.stub.putState(`PAYMENT_${orderId}`, Buffer.from(JSON.stringify(payment)));
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    /**
     * ConfirmRefund — PayHere void/refund API succeeded.
     */
    @Transaction()
    async ConfirmRefund(ctx: Context, orderId: string, refundId: string): Promise<void> {
        const paymentData = await ctx.stub.getState(`PAYMENT_${orderId}`);
        if (!paymentData || paymentData.length === 0) throw new Error(`Payment for order ${orderId} not found`);
        const payment = JSON.parse(paymentData.toString());

        const orderData = await ctx.stub.getState(orderId);
        const order = JSON.parse(orderData.toString());

        if (payment.status !== 'PENDING_REFUND') throw new Error('Payment is not pending refund');

        const txTimestamp = ctx.stub.getTxTimestamp();
        const now = new Date(Number(txTimestamp.seconds) * 1000).toISOString();

        payment.status = 'REFUNDED';
        payment.refundId = refundId;
        payment.refundedAt = now;
        payment.updatedAt = now;

        order.paymentStatus = 'REFUNDED';
        order.status = 'CANCELLED';
        order.updatedAt = now;

        await ctx.stub.putState(`PAYMENT_${orderId}`, Buffer.from(JSON.stringify(payment)));
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    // ─────────────────────────────────────────────────────────────
    //  QUERIES
    // ─────────────────────────────────────────────────────────────

    @Transaction(false)
    async GetPayment(ctx: Context, orderId: string): Promise<string> {
        const paymentData = await ctx.stub.getState(`PAYMENT_${orderId}`);
        if (!paymentData || paymentData.length === 0) throw new Error(`Payment for order ${orderId} not found`);
        return paymentData.toString();
    }
}