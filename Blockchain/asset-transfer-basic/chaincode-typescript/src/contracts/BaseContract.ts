import { Contract, Context } from 'fabric-contract-api';

export class BaseContract extends Contract {
    constructor(name: string) {
        super(name);
    }

    // Helper: Get Client Identity & Role
    protected getClient(ctx: Context) {
        const cid = ctx.clientIdentity;
        return {
            id: cid.getID(),
            mspId: cid.getMSPID(),
            role: cid.getAttributeValue('role')
        };
    }

    // Helper: Check if record exists
    protected async entityExists(ctx: Context, id: string): Promise<boolean> {
        const data = await ctx.stub.getState(id);
        return data && data.length > 0;
    }

    // Helper: Standard Query
    protected async queryBySelector(ctx: Context, selector: any): Promise<any[]> {
        const iterator = await ctx.stub.getQueryResult(JSON.stringify(selector));
        const results = [];
        let result = await iterator.next();
        while (!result.done) {
            // FIX: Wrap result.value.value in Buffer.from() before converting to string
            if (result.value && result.value.value) {
                const strValue = Buffer.from(result.value.value).toString('utf8');
                results.push(JSON.parse(strValue));
            }
            result = await iterator.next();
        }
        return results;
    }
}