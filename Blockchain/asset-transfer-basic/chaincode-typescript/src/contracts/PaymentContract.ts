import { Context, Transaction, Info } from 'fabric-contract-api';
import { BaseContract } from './BaseContract';

@Info({ title: 'PaymentContract', description: 'PayHere Preauthorization and Capture Payment Management' })
export class PaymentContract extends BaseContract {

    @Transaction()
    async InitiatePayment(ctx: Context, orderId: string, amount: number, paymentMethod: string): Promise<void> {
        const client = this.getClient(ctx);
        if (client.role !== 'buyer') throw new Error('Only buyers can initiate payments');

        // Get order
        const orderData = await ctx.stub.getState(orderId);
        if (!orderData || orderData.length === 0) throw new Error(`Order ${orderId} not found`);
        const order = JSON.parse(orderData.toString());

        // Verify buyer owns this order
        if (order.buyerId !== client.id) throw new Error('Unauthorized: Order does not belong to this buyer');

        // Verify order is confirmed
        if (order.status !== 'CONFIRMED') throw new Error('Cannot initiate payment for unconfirmed orders');

        // Create payment record
        const txTimestamp = ctx.stub.getTxTimestamp();
        const payment = {
            id: `PAYMENT_${orderId}`,
            docType: 'payment',
            orderId: orderId,
            buyerId: order.buyerId,
            sellerId: order.sellerId,
            amount: amount,
            paymentMethod: paymentMethod,
            status: 'PENDING',
            initiatedAt: new Date(txTimestamp.seconds.toNumber() * 1000).toISOString(),
            createdAt: new Date(txTimestamp.seconds.toNumber() * 1000).toISOString()
        };

        // Update order payment status
        order.paymentStatus = 'PENDING';
        order.updatedAt = payment.initiatedAt;

        await ctx.stub.putState(`PAYMENT_${orderId}`, Buffer.from(JSON.stringify(payment)));
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    @Transaction()
    async AuthorizePayment(ctx: Context, orderId: string, authorizationId: string): Promise<void> {
        // Called after PayHere preauthorization succeeds (money is held)
        
        // Get payment record
        const paymentData = await ctx.stub.getState(`PAYMENT_${orderId}`);
        if (!paymentData || paymentData.length === 0) throw new Error(`Payment for order ${orderId} not found`);
        const payment = JSON.parse(paymentData.toString());

        // Get order
        const orderData = await ctx.stub.getState(orderId);
        const order = JSON.parse(orderData.toString());

        // Update payment to authorized (money held by PayHere)
        const txTimestamp = ctx.stub.getTxTimestamp();
        payment.status = 'AUTHORIZED';
        payment.authorizationId = authorizationId;
        payment.authorizedAt = new Date(txTimestamp.seconds.toNumber() * 1000).toISOString();
        payment.updatedAt = payment.authorizedAt;

        // Update order payment status
        order.paymentStatus = 'AUTHORIZED';
        order.status = 'PAID_PENDING_DELIVERY';
        order.updatedAt = payment.authorizedAt;

        await ctx.stub.putState(`PAYMENT_${orderId}`, Buffer.from(JSON.stringify(payment)));
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    @Transaction()
    async ReleasePayment(ctx: Context, orderId: string, transporterId: string): Promise<void> {
        const client = this.getClient(ctx);
        // Transporter triggers release after confirming quality AT PICKUP (before taking goods)
        if (client.role !== 'transporter') throw new Error('Only transporters can release payments after quality check');

        // Get payment record
        const paymentData = await ctx.stub.getState(`PAYMENT_${orderId}`);
        if (!paymentData || paymentData.length === 0) throw new Error(`Payment for order ${orderId} not found`);
        const payment = JSON.parse(paymentData.toString());

        // Get order
        const orderData = await ctx.stub.getState(orderId);
        const order = JSON.parse(orderData.toString());

        // Verify transporter is assigned to this order
        if (order.transporterId !== transporterId) throw new Error('Unauthorized: You are not assigned to this order');

        // Payment can be released after quality confirmation AT PICKUP (not after delivery)
        if (order.status !== 'PAID_PENDING_DELIVERY' && order.status !== 'PICKED_UP') {
            throw new Error('Cannot release payment. Order must be ready for pickup with authorized payment');
        }
        if (payment.status !== 'AUTHORIZED') throw new Error('Payment is not authorized/held by PayHere');

        // Mark as ready for release (actual capture done by PayHere API in backend)
        const txTimestamp = ctx.stub.getTxTimestamp();
        payment.status = 'PENDING_RELEASE';
        payment.qualityConfirmedBy = transporterId;
        payment.qualityConfirmedAt = new Date(txTimestamp.seconds.toNumber() * 1000).toISOString();
        payment.updatedAt = payment.qualityConfirmedAt;

        // Update order - quality checked at pickup
        order.paymentStatus = 'PENDING_RELEASE';
        order.status = 'PICKED_UP';
        order.qualityConfirmedAt = payment.qualityConfirmedAt;
        order.updatedAt = payment.qualityConfirmedAt;

        await ctx.stub.putState(`PAYMENT_${orderId}`, Buffer.from(JSON.stringify(payment)));
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    @Transaction()
    async ConfirmPaymentRelease(ctx: Context, orderId: string, captureId: string): Promise<void> {
        // Called after PayHere capture API succeeds (money released to farmer)
        
        // Get payment record
        const paymentData = await ctx.stub.getState(`PAYMENT_${orderId}`);
        if (!paymentData || paymentData.length === 0) throw new Error(`Payment for order ${orderId} not found`);
        const payment = JSON.parse(paymentData.toString());

        // Get order
        const orderData = await ctx.stub.getState(orderId);
        const order = JSON.parse(orderData.toString());

        if (payment.status !== 'PENDING_RELEASE') throw new Error('Payment is not pending release');

        // Confirm release completed
        const txTimestamp = ctx.stub.getTxTimestamp();
        payment.status = 'RELEASED';
        payment.captureId = captureId;
        payment.releasedAt = new Date(txTimestamp.seconds.toNumber() * 1000).toISOString();
        payment.updatedAt = payment.releasedAt;

        // Update order to completed
        order.paymentStatus = 'RELEASED';
        order.status = 'COMPLETED';
        order.updatedAt = payment.releasedAt;

        await ctx.stub.putState(`PAYMENT_${orderId}`, Buffer.from(JSON.stringify(payment)));
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    @Transaction()
    async RefundPayment(ctx: Context, orderId: string, reason: string): Promise<void> {
        // Can be called by admin or in case of cancellation
        // Marks payment for refund - actual void/refund processed by PayHere API
        
        // Get payment record
        const paymentData = await ctx.stub.getState(`PAYMENT_${orderId}`);
        if (!paymentData || paymentData.length === 0) throw new Error(`Payment for order ${orderId} not found`);
        const payment = JSON.parse(paymentData.toString());

        // Get order
        const orderData = await ctx.stub.getState(orderId);
        const order = JSON.parse(orderData.toString());

        if (payment.status !== 'AUTHORIZED' && payment.status !== 'PENDING_RELEASE') {
            throw new Error('Can only refund authorized/pending payments');
        }

        // Mark as pending refund (actual void done by PayHere API)
        const txTimestamp = ctx.stub.getTxTimestamp();
        payment.status = 'PENDING_REFUND';
        payment.refundReason = reason;
        payment.refundInitiatedAt = new Date(txTimestamp.seconds.toNumber() * 1000).toISOString();
        payment.updatedAt = payment.refundInitiatedAt;

        // Update order
        order.paymentStatus = 'PENDING_REFUND';
        order.updatedAt = payment.refundInitiatedAt;

        await ctx.stub.putState(`PAYMENT_${orderId}`, Buffer.from(JSON.stringify(payment)));
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    @Transaction()
    async ConfirmRefund(ctx: Context, orderId: string, refundId: string): Promise<void> {
        // Called after PayHere void/refund API succeeds
        
        // Get payment record
        const paymentData = await ctx.stub.getState(`PAYMENT_${orderId}`);
        if (!paymentData || paymentData.length === 0) throw new Error(`Payment for order ${orderId} not found`);
        const payment = JSON.parse(paymentData.toString());

        // Get order
        const orderData = await ctx.stub.getState(orderId);
        const order = JSON.parse(orderData.toString());

        if (payment.status !== 'PENDING_REFUND') throw new Error('Payment is not pending refund');

        // Confirm refund completed
        const txTimestamp = ctx.stub.getTxTimestamp();
        payment.status = 'REFUNDED';
        payment.refundId = refundId;
        payment.refundedAt = new Date(txTimestamp.seconds.toNumber() * 1000).toISOString();
        payment.updatedAt = payment.refundedAt;

        // Update order to cancelled
        order.paymentStatus = 'REFUNDED';
        order.status = 'CANCELLED';
        order.updatedAt = payment.refundedAt;

        await ctx.stub.putState(`PAYMENT_${orderId}`, Buffer.from(JSON.stringify(payment)));
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    @Transaction(false)
    async GetPayment(ctx: Context, orderId: string): Promise<string> {
        const paymentData = await ctx.stub.getState(`PAYMENT_${orderId}`);
        if (!paymentData || paymentData.length === 0) throw new Error(`Payment for order ${orderId} not found`);
        return paymentData.toString();
    }
}