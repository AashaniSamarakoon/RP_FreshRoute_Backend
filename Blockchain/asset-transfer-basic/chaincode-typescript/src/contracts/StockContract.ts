import { Context, Transaction, Info } from 'fabric-contract-api';
import { BaseContract } from './BaseContract';

@Info({ title: 'StockContract', description: 'Manage Harvest Assets' })
export class StockContract extends BaseContract {

    @Transaction()
    async CreateHarvest(ctx: Context, harvestId: string, fruitId: string, quantity: string, pricePerUnit: string): Promise<void> {
        const client = this.getClient(ctx);
        if (client.role !== 'farmer') throw new Error('Only farmers can create harvests');

        const txTimestamp = ctx.stub.getTxTimestamp();
        const createdAt = new Date(txTimestamp.seconds.toNumber() * 1000).toISOString();

        const harvest = {
            id: harvestId,
            docType: 'harvest',
            farmerId: client.id,
            fruitId,
            quantity: parseInt(quantity),
            availableQuantity: parseInt(quantity),
            pricePerUnit: parseFloat(pricePerUnit),
            status: 'FRESH',
            createdAt: createdAt
        };

        await ctx.stub.putState(harvestId, Buffer.from(JSON.stringify(harvest)));
    }

    @Transaction(false)
    async ReadHarvest(ctx: Context, harvestId: string): Promise<string> {
        const data = await ctx.stub.getState(harvestId);
        if (!data || data.length === 0) throw new Error(`Harvest ${harvestId} does not exist`);
        return data.toString();
    }

    @Transaction()
    async UpdateHarvest(ctx: Context, harvestId: string, newQuantity: string, newPrice: string, status: string): Promise<void> {
        const data = await ctx.stub.getState(harvestId);
        if (!data || data.length === 0) throw new Error(`Harvest ${harvestId} not found`);
        
        const harvest = JSON.parse(data.toString());
        const client = this.getClient(ctx);

        // Security: Only the owner (farmer) can update their stock
        if (harvest.farmerId !== client.id) throw new Error('Unauthorized update attempt');

        harvest.quantity = parseInt(newQuantity);
        harvest.availableQuantity = parseInt(newQuantity); // Reset available stock
        harvest.pricePerUnit = parseFloat(newPrice);
        harvest.status = status;
        
        const txTimestamp = ctx.stub.getTxTimestamp();
        harvest.updatedAt = new Date(txTimestamp.seconds.toNumber() * 1000).toISOString();

        await ctx.stub.putState(harvestId, Buffer.from(JSON.stringify(harvest)));
    }

    @Transaction()
    async DeleteHarvest(ctx: Context, harvestId: string): Promise<void> {
        const data = await ctx.stub.getState(harvestId);
        if (!data || data.length === 0) throw new Error(`Harvest ${harvestId} not found`);
        
        const harvest = JSON.parse(data.toString());
        const client = this.getClient(ctx);

        if (harvest.farmerId !== client.id) throw new Error('Unauthorized delete attempt');

        await ctx.stub.deleteState(harvestId);
    }
}