import { Context, Transaction, Info } from 'fabric-contract-api';
import { BaseContract } from './BaseContract';

@Info({ title: 'UserContract', description: 'Manage Users' })
export class UserContract extends BaseContract {

    @Transaction()
    async RegisterUser(ctx: Context, id: string, name: string, type: 'farmer' | 'buyer' | 'transporter'): Promise<void> {
        const client = this.getClient(ctx);
        
        // Security: Ensure the MSP matches the requested role
        // (e.g., Org1 can only register farmers)
        
        const user = {
            id,
            docType: 'user',
            name,
            type,
            mspId: client.mspId,
            balance: 0, // For payments
            reputation: 5.0
        };

        await ctx.stub.putState(id, Buffer.from(JSON.stringify(user)));
    }

    @Transaction(false)
    async GetUser(ctx: Context, id: string): Promise<string> {
        const data = await ctx.stub.getState(id);
        return data.toString();
    }
}