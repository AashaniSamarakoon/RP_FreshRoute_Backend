import { Context, Transaction, Info } from 'fabric-contract-api';
import { BaseContract } from './BaseContract';

@Info({ title: 'OrderContract', description: 'Manage Buying Process' })
export class OrderContract extends BaseContract {

    @Transaction()
    async PlaceOrder(ctx: Context, orderId: string, fruitType: string, variant: string, grade: string, quantity: string, requiredDate: string): Promise<void> {
        const client = this.getClient(ctx);
        if (client.role !== 'buyer') throw new Error('Only buyers can place orders');

        const qty = parseInt(quantity);
        if (qty <= 0) throw new Error('Quantity must be positive');

        // Generate timestamp
        const txTimestamp = ctx.stub.getTxTimestamp();
        const createdAt = new Date(txTimestamp.seconds.toNumber() * 1000).toISOString();

        // Create initial order asset (not tied to specific harvest yet)
        const order = {
            id: orderId,
            docType: 'order',
            buyerId: client.id,
            fruitType: fruitType,
            variant: variant,
            grade: grade,
            quantity: qty,
            requiredDate: requiredDate,
            status: 'PLACED', // Initial status - waiting for matching
            createdAt: createdAt
        };

        // Write to ledger
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    @Transaction()
    async CreateOrder(ctx: Context, orderId: string, harvestId: string, quantity: string): Promise<void> {
        const client = this.getClient(ctx);
        if (client.role !== 'buyer') throw new Error('Only buyers can create orders');

        const qty = parseInt(quantity);
        if (qty <= 0) throw new Error('Quantity must be positive');

        // 1. Check if initial order exists
        const existingOrderData = await ctx.stub.getState(orderId);
        if (!existingOrderData || existingOrderData.length === 0) {
            throw new Error(`Initial order ${orderId} not found. Place order first.`);
        }
        const existingOrder = JSON.parse(existingOrderData.toString());
        
        // Verify buyer owns this order
        if (existingOrder.buyerId !== client.id) {
            throw new Error('Unauthorized: Order does not belong to this buyer');
        }

        // 2. Fetch Harvest (The Source of Truth)
        const harvestData = await ctx.stub.getState(harvestId);
        if (!harvestData || harvestData.length === 0) throw new Error(`Harvest ${harvestId} not found`);
        const harvest = JSON.parse(harvestData.toString());

        // 3. Validate Stock
        if (harvest.availableQuantity < qty) {
            throw new Error(`Insufficient stock. Requested: ${qty}, Available: ${harvest.availableQuantity}`);
        }

        // 4. Generate Timestamp
        const txTimestamp = ctx.stub.getTxTimestamp();
        const createdAt = new Date(txTimestamp.seconds.toNumber() * 1000).toISOString();

        // 5. Update Order Asset with harvest details
        // Note: We use the Farmer's unit price from the ledger to calculate Total
        const totalPrice = qty * harvest.pricePerUnit;

        const updatedOrder = {
            ...existingOrder,
            harvestId: harvestId,
            sellerId: harvest.farmerId,
            transporterId: '', // Assigned later
            unitPrice: harvest.pricePerUnit,
            totalPrice: totalPrice,
            status: 'CONFIRMED', // Final confirmed status
            confirmedAt: createdAt
        };

        // 6. Deduct Stock (The "Lock")
        harvest.availableQuantity -= qty;
        
        // If stock hits 0, update status
        if (harvest.availableQuantity === 0) {
            harvest.status = 'SOLD_OUT';
        }

        // 7. Write both to Ledger
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(updatedOrder)));
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
        const client = this.getClient(ctx);
        
        if (order.buyerId !== client.id) throw new Error('Unauthorized: Order does not belong to this buyer');

        const qty = parseInt(newQuantity.toString());
        if (qty <= 0) throw new Error('Quantity must be positive');

        // Only adjust stock if order is confirmed (has harvestId)
        if (order.harvestId && order.status === 'CONFIRMED') {
            const harvestData = await ctx.stub.getState(order.harvestId);
            const harvest = JSON.parse(harvestData.toString());

            // Adjust stock: return old quantity, deduct new quantity
            const stockToReturn = order.quantity - qty;
            if (harvest.availableQuantity + stockToReturn < 0) throw new Error('Insufficient stock for update');

            harvest.availableQuantity += stockToReturn;
            order.quantity = qty;
            order.totalPrice = qty * harvest.pricePerUnit;

            await ctx.stub.putState(order.harvestId, Buffer.from(JSON.stringify(harvest)));
        } else {
            // For placed orders, just update quantity
            order.quantity = qty;
        }

        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    @Transaction()
    async DeleteOrder(ctx: Context, orderId: string): Promise<void> {
        const orderData = await ctx.stub.getState(orderId);
        if (!orderData || orderData.length === 0) throw new Error('Order not found');
        const order = JSON.parse(orderData.toString());
        const client = this.getClient(ctx);
        
        if (order.buyerId !== client.id) throw new Error('Unauthorized: Order does not belong to this buyer');

        // Only return stock if order is confirmed (has harvestId and stock was deducted)
        if (order.harvestId && order.status === 'CONFIRMED') {
            const harvestData = await ctx.stub.getState(order.harvestId);
            const harvest = JSON.parse(harvestData.toString());
            harvest.availableQuantity += order.quantity;
            await ctx.stub.putState(order.harvestId, Buffer.from(JSON.stringify(harvest)));
        }

        // Delete the order
        await ctx.stub.deleteState(orderId);
    }
}