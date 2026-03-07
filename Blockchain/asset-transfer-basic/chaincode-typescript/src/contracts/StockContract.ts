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
        imageHashesJson: string, // JSON string of array, e.g. '["hash1","hash2"]'
        grade: string,           // e.g. 'A' | 'B' | 'C' — pass '' if unknown
        harvestDate: string      // ISO date e.g. '2026-03-07' — pass '' if unknown
    ): Promise<void> {
        const client = this.getClient(ctx);
        if (client.role !== 'farmer') throw new Error('Only farmers can create harvests');

        const txTimestamp = ctx.stub.getTxTimestamp();
        const createdAt = new Date(Number(txTimestamp.seconds) * 1000).toISOString();

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
            grade: grade || '',
            harvestDate: harvestDate || '',
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
        newImageHashesJson: string, // JSON string of array
        grade: string,              // pass '' to keep existing
        harvestDate: string         // pass '' to keep existing
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

        if (grade)       harvest.grade       = grade;
        if (harvestDate) harvest.harvestDate = harvestDate;
        
        const txTimestamp = ctx.stub.getTxTimestamp();
        harvest.updatedAt = new Date(Number(txTimestamp.seconds) * 1000).toISOString();

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

    // --- QUERY FUNCTIONS FOR DASHBOARD ---
    
    @Transaction(false)
    async GetAllHarvests(ctx: Context): Promise<string> {
        const allResults = [];
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();
        
        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
                if (record.docType === 'harvest') {
                    allResults.push(record);
                }
            } catch (err) {
                console.log(err);
            }
            result = await iterator.next();
        }
        await iterator.close();
        return JSON.stringify(allResults);
    }

    @Transaction(false)
    async GetHarvestsByFarmer(ctx: Context, farmerId: string): Promise<string> {
        const query = {
            selector: {
                docType: 'harvest',
                farmerId: farmerId
            }
        };

        const queryString = JSON.stringify(query);
        const iterator = await ctx.stub.getQueryResult(queryString);
        const results = [];

        let result = await iterator.next();
        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
                results.push(record);
            } catch (err) {
                console.log(err);
            }
            result = await iterator.next();
        }
        await iterator.close();
        return JSON.stringify(results);
    }

    @Transaction(false)
    async GetHarvestHistory(ctx: Context, harvestId: string): Promise<string> {
        const iterator = await ctx.stub.getHistoryForKey(harvestId);
        const results = [];

        let result = await iterator.next();
        while (!result.done) {
            const timestamp = result.value.timestamp;
            const record = {
                txId: result.value.txId,
                timestamp: timestamp ? new Date(Number(timestamp.seconds) * 1000).toISOString() : null,
                isDelete: result.value.isDelete,
                value: Buffer.from(result.value.value.toString()).toString('utf8')
            };
            results.push(record);
            result = await iterator.next();
        }
        await iterator.close();
        return JSON.stringify(results);
    }

    @Transaction(false)
    async GetHarvestsByStatus(ctx: Context, status: string): Promise<string> {
        const query = {
            selector: {
                docType: 'harvest',
                status: status
            }
        };

        const queryString = JSON.stringify(query);
        const iterator = await ctx.stub.getQueryResult(queryString);
        const results = [];

        let result = await iterator.next();
        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
                results.push(record);
            } catch (err) {
                console.log(err);
            }
            result = await iterator.next();
        }
        await iterator.close();
        return JSON.stringify(results);
    }
}