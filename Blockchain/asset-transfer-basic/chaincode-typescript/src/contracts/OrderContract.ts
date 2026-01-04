import { Context, Transaction, Info } from 'fabric-contract-api';
import { BaseContract } from './BaseContract';

@Info({ title: 'OrderContract', description: 'Manage Buying Process' })
export class OrderContract extends BaseContract {

    @Transaction()
    async CreateOrder(ctx: Context, orderId: string, harvestId: string, quantity: string): Promise<void> {
        const client = this.getClient(ctx);
        if (client.role !== 'buyer') throw new Error('Only buyers can create orders');

        const qty = parseInt(quantity);
        if (qty <= 0) throw new Error('Quantity must be positive');

        // 1. Fetch Harvest (The Source of Truth)
        const harvestData = await ctx.stub.getState(harvestId);
        if (!harvestData || harvestData.length === 0) throw new Error(`Harvest ${harvestId} not found`);
        const harvest = JSON.parse(harvestData.toString());

        // 2. Validate Stock
        if (harvest.availableQuantity < qty) {
            throw new Error(`Insufficient stock. Requested: ${qty}, Available: ${harvest.availableQuantity}`);
        }

        // 3. Generate Timestamp
        const txTimestamp = ctx.stub.getTxTimestamp();
        const createdAt = new Date(txTimestamp.seconds.toNumber() * 1000).toISOString();

        // 4. Create Order Asset
        // Note: We use the Farmer's unit price from the ledger to calculate Total
        const totalParamsPrice = qty * harvest.pricePerUnit;

        const order = {
            id: orderId,
            docType: 'order',
            harvestId: harvestId,
            buyerId: client.id,
            sellerId: harvest.farmerId,
            transporterId: '', // Assigned later
            quantity: qty,
            unitPrice: harvest.pricePerUnit,
            totalPrice: totalParamsPrice,
            status: 'ACCEPTED', // Created = Accepted in this new flow
            createdAt: createdAt
        };

        // 5. Deduct Stock (The "Lock")
        harvest.availableQuantity -= qty;
        
        // If stock hits 0, update status
        if (harvest.availableQuantity === 0) {
            harvest.status = 'SOLD_OUT';
        }

        // 6. Write both to Ledger
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
        await ctx.stub.putState(harvestId, Buffer.from(JSON.stringify(harvest)));
    }

    @Transaction(false)
    async ReadOrder(ctx: Context, orderId: string): Promise<string> {
        const orderData = await ctx.stub.getState(orderId);
        if (!orderData || orderData.length === 0) throw new Error(`Order ${orderId} not found`);
        return orderData.toString();
    }

    @Transaction()
    async UpdateOrderQuantity(ctx: Context, orderId: string, newQuantity: number): Promise<void> {
        const orderData = await ctx.stub.getState(orderId);
        const order = JSON.parse(orderData.toString());
        
        const harvestData = await ctx.stub.getState(order.harvestId);
        const harvest = JSON.parse(harvestData.toString());

        // Adjust stock: return old quantity, deduct new quantity
        const stockToReturn = order.quantity - newQuantity;
        if (harvest.availableQuantity + stockToReturn < 0) throw new Error('Insufficient stock for update');

        harvest.availableQuantity += stockToReturn;
        order.quantity = newQuantity;
        order.totalPrice = newQuantity * harvest.pricePerUnit;

        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
        await ctx.stub.putState(order.harvestId, Buffer.from(JSON.stringify(harvest)));
    }

    @Transaction()
    async DeleteOrder(ctx: Context, orderId: string): Promise<void> {
        const orderData = await ctx.stub.getState(orderId);
        if (!orderData || orderData.length === 0) throw new Error('Order not found');
        const order = JSON.parse(orderData.toString());

        // Return stock to harvest before deleting
        const harvestData = await ctx.stub.getState(order.harvestId);
        const harvest = JSON.parse(harvestData.toString());
        harvest.availableQuantity += order.quantity;

        await ctx.stub.putState(order.harvestId, Buffer.from(JSON.stringify(harvest)));
        await ctx.stub.deleteState(orderId);
    }
}