// import { Context, Transaction, Info } from 'fabric-contract-api';
// import { BaseContract } from './BaseContract';

// @Info({ title: 'PaymentContract', description: 'Escrow and Release' })
// export class PaymentContract extends BaseContract {

//     @Transaction()
//     async ReleasePayment(ctx: Context, orderId: string): Promise<void> {
//         const client = this.getClient(ctx);
        
//         const orderData = await ctx.stub.getState(orderId);
//         const order = JSON.parse(orderData.toString());

//         // Logic: Payment is released only if Buyer confirms receipt OR status is DELIVERED
//         if (order.status !== 'DELIVERED') throw new Error('Cannot release payment before delivery');
        
//         // (In a real system, you would move tokens here)
//         order.paymentStatus = 'RELEASED';
        
//         await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
//     }
// }