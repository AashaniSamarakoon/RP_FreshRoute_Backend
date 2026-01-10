import { Context, Transaction, Info } from 'fabric-contract-api';
import { BaseContract } from './BaseContract';

@Info({ title: 'StockContract', description: 'Manage Harvest Assets' })
export class StockContract extends BaseContract {

    // --- 1. CREATE: Accepts Array of Hashes as JSON string ---
    @Transaction()
    async CreateHarvest(
        ctx: Context, 
        harvestId: string, 
        fruitId: string, 
        quantity: string, 
        pricePerUnit: string,
        imageHashesJson: string // JSON string of array, e.g. '["hash1","hash2"]'
    ): Promise<void> {
        const client = this.getClient(ctx);
        if (client.role !== 'farmer') throw new Error('Only farmers can create harvests');

        const txTimestamp = ctx.stub.getTxTimestamp();
        const createdAt = new Date(txTimestamp.seconds.toNumber() * 1000).toISOString();

        // Parse the JSON string to array
        let imageHashes: string[] = [];
        try {
            imageHashes = JSON.parse(imageHashesJson || '[]');
        } catch (e) {
            imageHashes = [];
        }

        const harvest = {
            id: harvestId,
            docType: 'harvest',
            farmerId: client.id,
            fruitId,
            quantity: parseInt(quantity),
            availableQuantity: parseInt(quantity),
            pricePerUnit: parseFloat(pricePerUnit),
            status: 'FRESH',
            imageHashes: imageHashes, // <--- Storing multiple proofs
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

    // --- 2. UPDATE: Accepts Array of Hashes as JSON string ---
    @Transaction()
    async UpdateHarvest(
        ctx: Context, 
        harvestId: string, 
        newQuantity: string, 
        newPrice: string, 
        status: string,
        newImageHashesJson: string // JSON string of array
    ): Promise<void> {
        const data = await ctx.stub.getState(harvestId);
        if (!data || data.length === 0) throw new Error(`Harvest ${harvestId} not found`);
        
        const harvest = JSON.parse(data.toString());
        const client = this.getClient(ctx);

        if (harvest.farmerId !== client.id) throw new Error('Unauthorized update attempt');

        harvest.quantity = parseInt(newQuantity);
        harvest.availableQuantity = parseInt(newQuantity);
        harvest.pricePerUnit = parseFloat(newPrice);
        harvest.status = status;
        
        // Parse and update hashes if valid JSON array is sent
        try {
            const newImageHashes = JSON.parse(newImageHashesJson || '[]');
            if (Array.isArray(newImageHashes) && newImageHashes.length > 0) {
                harvest.imageHashes = newImageHashes;
            }
        } catch (e) {
            // Keep existing hashes if parsing fails
        }
        
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