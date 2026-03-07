import { Context, Transaction, Info } from 'fabric-contract-api';
import { BaseContract } from './BaseContract';

/**
 * LogisticsContract — immutable record of the three critical transport milestones.
 *
 * Deliberately minimal: we only write to the ledger for business-critical events
 * that need tamper-proof audit trails. Frequent updates like GPS location pings
 * or telemetry readings are NOT recorded here — those belong in the backend DB.
 *
 * State machine per order:
 *   AssignTransporter  →  ConfirmPickup  →  ConfirmDelivery
 *   (ASSIGNED)             (PICKED_UP)        (DELIVERED)
 *
 * A DELIVERY_{orderId} record is created on AssignTransporter and updated
 * through the lifecycle. The ORDER record is also updated at each step.
 */
@Info({ title: 'LogisticsContract', description: 'Immutable record of transport milestones — assignment, pickup, delivery' })
export class LogisticsContract extends BaseContract {

    constructor() { super('LogisticsContract'); }

    /**
     * AssignTransporter — records the vehicle-assignment algorithm's decision
     * on the ledger. Called after the backend assigns vehicles to an order.
     *
     * vehicleType: 'REFRIGERATED' | 'COVERED' | 'UNCOVERED'
     * assignmentReason: human-readable reason from the algorithm (e.g. "High Heat conditions")
     */
    @Transaction()
    async AssignTransporter(
        ctx: Context,
        orderId: string,
        transporterId: string,
        vehicleType: string,
        assignmentReason: string,
        loadWeightKg: string
    ): Promise<void> {
        const client = this.getClient(ctx);
        if (client.role !== 'transporter' && client.role !== 'admin') {
            throw new Error('Only transporters or admins can record transport assignments');
        }

        const orderData = await ctx.stub.getState(orderId);
        if (!orderData || orderData.length === 0) throw new Error(`Order ${orderId} not found`);
        const order = JSON.parse(orderData.toString());

        const deliveryKey = `DELIVERY_${orderId}`;
        const existingDelivery = await ctx.stub.getState(deliveryKey);
        if (existingDelivery && existingDelivery.length > 0) {
            throw new Error(`Transporter already assigned for order ${orderId}`);
        }

        const txTimestamp = ctx.stub.getTxTimestamp();
        const now = new Date(Number(txTimestamp.seconds) * 1000).toISOString();

        const deliveryRecord = {
            id: deliveryKey,
            docType: 'delivery',
            orderId,
            transporterId,
            vehicleType,
            loadWeightKg: parseFloat(loadWeightKg),
            assignmentReason,
            status: 'ASSIGNED',
            assignedAt: now,
            createdAt: now,
            updatedAt: now,
        };

        // Update order with assigned transporter
        order.transporterId = transporterId;
        // Only advance status if the order is in a state that makes sense
        if (order.status === 'CONFIRMED' || order.status === 'PAID_PENDING_DELIVERY') {
            order.status = 'MATCHED';
        }
        order.updatedAt = now;

        await ctx.stub.putState(deliveryKey, Buffer.from(JSON.stringify(deliveryRecord)));
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    /**
     * ConfirmPickup — transporter physically picks up goods after confirming quality.
     * Records quality score and stock condition at the point of collection.
     * This is the moment of formal handoff from farmer to transporter.
     *
     * stockCondition: e.g. 'GOOD' | 'FAIR' | 'POOR'
     */
    @Transaction()
    async ConfirmPickup(
        ctx: Context,
        orderId: string,
        qualityScore: string,
        stockCondition: string
    ): Promise<void> {
        const client = this.getClient(ctx);
        if (client.role !== 'transporter') throw new Error('Only transporters can confirm pickup');

        const deliveryKey = `DELIVERY_${orderId}`;
        const deliveryData = await ctx.stub.getState(deliveryKey);
        if (!deliveryData || deliveryData.length === 0) {
            throw new Error(`No delivery record for order ${orderId}. Call AssignTransporter first.`);
        }
        const delivery = JSON.parse(deliveryData.toString());

        if (delivery.transporterId !== client.id) throw new Error('Unauthorized: You are not assigned to this order');
        if (delivery.status !== 'ASSIGNED') throw new Error(`Cannot confirm pickup — status is ${delivery.status}, expected ASSIGNED`);

        const orderData = await ctx.stub.getState(orderId);
        const order = JSON.parse(orderData.toString());

        const txTimestamp = ctx.stub.getTxTimestamp();
        const now = new Date(Number(txTimestamp.seconds) * 1000).toISOString();

        delivery.status = 'PICKED_UP';
        delivery.qualityScore = parseFloat(qualityScore);
        delivery.stockCondition = stockCondition;
        delivery.pickedUpAt = now;
        delivery.updatedAt = now;

        order.status = 'IN_TRANSIT';
        order.updatedAt = now;

        await ctx.stub.putState(deliveryKey, Buffer.from(JSON.stringify(delivery)));
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    /**
     * ConfirmDelivery — transporter confirms goods were delivered and received.
     * This is the final logistics milestone — proof that the buyer got the goods.
     *
     * receivedBy: name/ID of the person who received the goods at the destination.
     */
    @Transaction()
    async ConfirmDelivery(
        ctx: Context,
        orderId: string,
        receivedBy: string
    ): Promise<void> {
        const client = this.getClient(ctx);
        if (client.role !== 'transporter') throw new Error('Only transporters can confirm delivery');

        const deliveryKey = `DELIVERY_${orderId}`;
        const deliveryData = await ctx.stub.getState(deliveryKey);
        if (!deliveryData || deliveryData.length === 0) throw new Error(`No delivery record for order ${orderId}`);
        const delivery = JSON.parse(deliveryData.toString());

        if (delivery.transporterId !== client.id) throw new Error('Unauthorized: You are not assigned to this order');
        if (delivery.status !== 'PICKED_UP' && delivery.status !== 'ASSIGNED') {
            throw new Error(`Cannot confirm delivery — status is ${delivery.status}`);
        }

        const orderData = await ctx.stub.getState(orderId);
        const order = JSON.parse(orderData.toString());

        const txTimestamp = ctx.stub.getTxTimestamp();
        const now = new Date(Number(txTimestamp.seconds) * 1000).toISOString();

        delivery.status = 'DELIVERED';
        delivery.receivedBy = receivedBy;
        delivery.deliveredAt = now;
        delivery.updatedAt = now;

        order.status = 'DELIVERED';
        order.updatedAt = now;

        await ctx.stub.putState(deliveryKey, Buffer.from(JSON.stringify(delivery)));
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    /**
     * GetDeliveryRecord — query the full delivery lifecycle for an order.
     */
    @Transaction(false)
    async GetDeliveryRecord(ctx: Context, orderId: string): Promise<string> {
        const deliveryKey = `DELIVERY_${orderId}`;
        const data = await ctx.stub.getState(deliveryKey);
        if (!data || data.length === 0) throw new Error(`No delivery record found for order ${orderId}`);
        return data.toString();
    }
}
