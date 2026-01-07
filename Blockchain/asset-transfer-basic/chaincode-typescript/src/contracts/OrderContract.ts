import { Context, Transaction, Info } from 'fabric-contract-api';
import { BaseContract } from './BaseContract';

@Info({ title: 'OrderContract', description: 'Manage Buying Process with Proposal Flow' })
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
            status: 'OPEN', // Initial status - waiting for proposals
            createdAt: createdAt
        };

        // Write to ledger
        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    @Transaction()
    async CreateProposal(ctx: Context, proposalId: string, orderId: string, harvestId: string, quantity: string): Promise<void> {
        const client = this.getClient(ctx);
        if (client.role !== 'farmer') throw new Error('Only farmers can create proposals');

        const qty = parseInt(quantity);
        if (qty <= 0) throw new Error('Quantity must be positive');

        // 1. Verify order exists and is OPEN
        const orderData = await ctx.stub.getState(orderId);
        if (!orderData || orderData.length === 0) throw new Error(`Order ${orderId} not found`);
        const order = JSON.parse(orderData.toString());

        if (order.status !== 'OPEN') throw new Error('Order is not available for proposals');

        // 2. Verify harvest exists and belongs to this farmer
        const harvestData = await ctx.stub.getState(harvestId);
        if (!harvestData || harvestData.length === 0) throw new Error(`Harvest ${harvestId} not found`);
        const harvest = JSON.parse(harvestData.toString());

        if (harvest.farmerId !== client.id) throw new Error('Unauthorized: Harvest does not belong to this farmer');
        if (harvest.availableQuantity < qty) throw new Error(`Insufficient stock. Requested: ${qty}, Available: ${harvest.availableQuantity}`);

        // 3. Generate timestamp and expiry (24 hours from now)
        const txTimestamp = ctx.stub.getTxTimestamp();
        const createdAt = new Date(txTimestamp.seconds.toNumber() * 1000).toISOString();
        const expiresAt = new Date(txTimestamp.seconds.toNumber() * 1000 + 24 * 60 * 60 * 1000).toISOString();

        // 4. Create proposal asset
        const proposal = {
            id: proposalId,
            docType: 'proposal',
            orderId: orderId,
            harvestId: harvestId,
            farmerId: client.id,
            buyerId: order.buyerId,
            quantity: qty,
            unitPrice: harvest.pricePerUnit,
            totalPrice: qty * harvest.pricePerUnit,
            status: 'PENDING_BUYER', // Initial status - waiting for buyer approval
            expiresAt: expiresAt,
            createdAt: createdAt
        };

        // 5. Reserve stock (temporarily deduct)
        harvest.availableQuantity -= qty;
        harvest.reservedQuantity = (harvest.reservedQuantity || 0) + qty;

        // 6. Write to ledger
        await ctx.stub.putState(proposalId, Buffer.from(JSON.stringify(proposal)));
        await ctx.stub.putState(harvestId, Buffer.from(JSON.stringify(harvest)));
    }

    @Transaction()
    async ApproveProposal(ctx: Context, proposalId: string): Promise<void> {
        const client = this.getClient(ctx);
        if (client.role !== 'buyer') throw new Error('Only buyers can approve proposals');

        // 1. Get proposal
        const proposalData = await ctx.stub.getState(proposalId);
        if (!proposalData || proposalData.length === 0) throw new Error(`Proposal ${proposalId} not found`);
        const proposal = JSON.parse(proposalData.toString());

        // 2. Verify buyer owns this proposal
        if (proposal.buyerId !== client.id) throw new Error('Unauthorized: Proposal does not belong to this buyer');

        // 3. Verify proposal is in correct status
        if (proposal.status !== 'PENDING_BUYER') throw new Error('Proposal is not pending buyer approval');

        // 4. Check if proposal has expired
        const now = new Date(ctx.stub.getTxTimestamp().seconds.toNumber() * 1000);
        const expiresAt = new Date(proposal.expiresAt);
        if (now > expiresAt) throw new Error('Proposal has expired');

        // 5. Update proposal status
        proposal.status = 'PENDING_FARMER';
        const txTimestamp = ctx.stub.getTxTimestamp();
        proposal.updatedAt = new Date(txTimestamp.seconds.toNumber() * 1000).toISOString();

        // 6. Update order status
        const orderData = await ctx.stub.getState(proposal.orderId);
        const order = JSON.parse(orderData.toString());
        order.status = 'PENDING_FARMER';
        order.updatedAt = proposal.updatedAt;

        // 7. Write to ledger
        await ctx.stub.putState(proposalId, Buffer.from(JSON.stringify(proposal)));
        await ctx.stub.putState(proposal.orderId, Buffer.from(JSON.stringify(order)));
    }

    @Transaction()
    async AcceptProposal(ctx: Context, proposalId: string): Promise<void> {
        const client = this.getClient(ctx);
        if (client.role !== 'farmer') throw new Error('Only farmers can accept proposals');

        // 1. Get proposal
        const proposalData = await ctx.stub.getState(proposalId);
        if (!proposalData || proposalData.length === 0) throw new Error(`Proposal ${proposalId} not found`);
        const proposal = JSON.parse(proposalData.toString());

        // 2. Verify farmer owns this proposal
        if (proposal.farmerId !== client.id) throw new Error('Unauthorized: Proposal does not belong to this farmer');

        // 3. Verify proposal is in correct status
        if (proposal.status !== 'PENDING_FARMER') throw new Error('Proposal is not pending farmer response');

        // 4. Check if proposal has expired
        const now = new Date(ctx.stub.getTxTimestamp().seconds.toNumber() * 1000);
        const expiresAt = new Date(proposal.expiresAt);
        if (now > expiresAt) throw new Error('Proposal has expired');

        // 5. Update proposal status
        proposal.status = 'ACCEPTED';
        const txTimestamp = ctx.stub.getTxTimestamp();
        proposal.acceptedAt = new Date(txTimestamp.seconds.toNumber() * 1000).toISOString();
        proposal.updatedAt = proposal.acceptedAt;

        // 6. Update order status to CONFIRMED
        const orderData = await ctx.stub.getState(proposal.orderId);
        const order = JSON.parse(orderData.toString());
        order.status = 'CONFIRMED';
        order.harvestId = proposal.harvestId;
        order.sellerId = proposal.farmerId;
        order.unitPrice = proposal.unitPrice;
        order.totalPrice = proposal.totalPrice;
        order.confirmedAt = proposal.acceptedAt;
        order.updatedAt = proposal.acceptedAt;

        // 7. Finalize stock reservation (convert reserved to sold)
        const harvestData = await ctx.stub.getState(proposal.harvestId);
        const harvest = JSON.parse(harvestData.toString());
        harvest.reservedQuantity -= proposal.quantity;
        harvest.soldQuantity = (harvest.soldQuantity || 0) + proposal.quantity;

        // 8. Write to ledger
        await ctx.stub.putState(proposalId, Buffer.from(JSON.stringify(proposal)));
        await ctx.stub.putState(proposal.orderId, Buffer.from(JSON.stringify(order)));
        await ctx.stub.putState(proposal.harvestId, Buffer.from(JSON.stringify(harvest)));
    }

    @Transaction()
    async RejectProposal(ctx: Context, proposalId: string): Promise<void> {
        const client = this.getClient(ctx);
        if (client.role !== 'farmer') throw new Error('Only farmers can reject proposals');

        // 1. Get proposal
        const proposalData = await ctx.stub.getState(proposalId);
        if (!proposalData || proposalData.length === 0) throw new Error(`Proposal ${proposalId} not found`);
        const proposal = JSON.parse(proposalData.toString());

        // 2. Verify farmer owns this proposal
        if (proposal.farmerId !== client.id) throw new Error('Unauthorized: Proposal does not belong to this farmer');

        // 3. Verify proposal is in correct status
        if (proposal.status !== 'PENDING_FARMER') throw new Error('Proposal is not pending farmer response');

        // 4. Update proposal status
        proposal.status = 'REJECTED';
        const txTimestamp = ctx.stub.getTxTimestamp();
        proposal.rejectedAt = new Date(txTimestamp.seconds.toNumber() * 1000).toISOString();
        proposal.updatedAt = proposal.rejectedAt;

        // 5. Release reserved stock back to available
        const harvestData = await ctx.stub.getState(proposal.harvestId);
        const harvest = JSON.parse(harvestData.toString());
        harvest.availableQuantity += proposal.quantity;
        harvest.reservedQuantity -= proposal.quantity;

        // 6. Update order status back to OPEN (so buyer can get other proposals)
        const orderData = await ctx.stub.getState(proposal.orderId);
        const order = JSON.parse(orderData.toString());
        order.status = 'OPEN';
        order.updatedAt = proposal.updatedAt;

        // 7. Write to ledger
        await ctx.stub.putState(proposalId, Buffer.from(JSON.stringify(proposal)));
        await ctx.stub.putState(proposal.orderId, Buffer.from(JSON.stringify(order)));
        await ctx.stub.putState(proposal.harvestId, Buffer.from(JSON.stringify(harvest)));
    }

    @Transaction()
    async ExpireProposal(ctx: Context, proposalId: string): Promise<void> {
        // This can be called by the system or manually to expire proposals

        // 1. Get proposal
        const proposalData = await ctx.stub.getState(proposalId);
        if (!proposalData || proposalData.length === 0) throw new Error(`Proposal ${proposalId} not found`);
        const proposal = JSON.parse(proposalData.toString());

        // 2. Check if already in final state
        if (['ACCEPTED', 'REJECTED', 'EXPIRED'].includes(proposal.status)) {
            throw new Error('Proposal is already in final state');
        }

        // 3. Check if actually expired
        const now = new Date(ctx.stub.getTxTimestamp().seconds.toNumber() * 1000);
        const expiresAt = new Date(proposal.expiresAt);
        if (now <= expiresAt) throw new Error('Proposal has not expired yet');

        // 4. Update proposal status
        proposal.status = 'EXPIRED';
        const txTimestamp = ctx.stub.getTxTimestamp();
        proposal.expiredAt = new Date(txTimestamp.seconds.toNumber() * 1000).toISOString();
        proposal.updatedAt = proposal.expiredAt;

        // 5. Release reserved stock back to available (if any)
        if (proposal.status === 'PENDING_BUYER' || proposal.status === 'PENDING_FARMER') {
            const harvestData = await ctx.stub.getState(proposal.harvestId);
            const harvest = JSON.parse(harvestData.toString());
            harvest.availableQuantity += proposal.quantity;
            harvest.reservedQuantity -= proposal.quantity;
            await ctx.stub.putState(proposal.harvestId, Buffer.from(JSON.stringify(harvest)));
        }

        // 6. Update order status back to OPEN if it was tied to this proposal
        if (proposal.status === 'PENDING_FARMER') {
            const orderData = await ctx.stub.getState(proposal.orderId);
            const order = JSON.parse(orderData.toString());
            order.status = 'OPEN';
            order.updatedAt = proposal.updatedAt;
            await ctx.stub.putState(proposal.orderId, Buffer.from(JSON.stringify(order)));
        }

        // 7. Write proposal
        await ctx.stub.putState(proposalId, Buffer.from(JSON.stringify(proposal)));
    }

    @Transaction()
    async CancelOrder(ctx: Context, orderId: string): Promise<void> {
        const client = this.getClient(ctx);
        if (client.role !== 'buyer') throw new Error('Only buyers can cancel orders');

        const orderData = await ctx.stub.getState(orderId);
        if (!orderData || orderData.length === 0) throw new Error(`Order ${orderId} not found`);
        const order = JSON.parse(orderData.toString());

        if (order.buyerId !== client.id) throw new Error('Unauthorized: Order does not belong to this buyer');

        // Only allow cancellation if order is not in final state
        if (order.status === 'CONFIRMED') throw new Error('Cannot cancel confirmed orders');

        // Update order status
        order.status = 'CANCELLED';
        const txTimestamp = ctx.stub.getTxTimestamp();
        order.cancelledAt = new Date(txTimestamp.seconds.toNumber() * 1000).toISOString();
        order.updatedAt = order.cancelledAt;

        // If order was CONFIRMED, release the stock back
        if (order.harvestId && order.status === 'CONFIRMED') {
            const harvestData = await ctx.stub.getState(order.harvestId);
            const harvest = JSON.parse(harvestData.toString());
            harvest.availableQuantity += order.quantity;
            harvest.soldQuantity -= order.quantity;
            await ctx.stub.putState(order.harvestId, Buffer.from(JSON.stringify(harvest)));
        }

        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    @Transaction(false)
    async ReadOrder(ctx: Context, orderId: string): Promise<string> {
        const orderData = await ctx.stub.getState(orderId);
        if (!orderData || orderData.length === 0) throw new Error(`Order ${orderId} not found`);
        return orderData.toString();
    }

    @Transaction(false)
    async ReadProposal(ctx: Context, proposalId: string): Promise<string> {
        const proposalData = await ctx.stub.getState(proposalId);
        if (!proposalData || proposalData.length === 0) throw new Error(`Proposal ${proposalId} not found`);
        return proposalData.toString();
    }

    @Transaction()
    async UpdateOrderQuantity(ctx: Context, orderId: string, newQuantity: number): Promise<void> {
        const orderData = await ctx.stub.getState(orderId);
        const order = JSON.parse(orderData.toString());
        const client = this.getClient(ctx);

        if (order.buyerId !== client.id) throw new Error('Unauthorized: Order does not belong to this buyer');

        const qty = parseInt(newQuantity.toString());
        if (qty <= 0) throw new Error('Quantity must be positive');

        // Only allow updates for OPEN or PENDING orders
        if (!['OPEN', 'PENDING_BUYER', 'PENDING_FARMER'].includes(order.status)) {
            throw new Error('Cannot update quantity for orders in final state');
        }

        order.quantity = qty;
        const txTimestamp = ctx.stub.getTxTimestamp();
        order.updatedAt = new Date(txTimestamp.seconds.toNumber() * 1000).toISOString();

        await ctx.stub.putState(orderId, Buffer.from(JSON.stringify(order)));
    }

    @Transaction()
    async DeleteOrder(ctx: Context, orderId: string): Promise<void> {
        const orderData = await ctx.stub.getState(orderId);
        if (!orderData || orderData.length === 0) throw new Error('Order not found');
        const order = JSON.parse(orderData.toString());
        const client = this.getClient(ctx);

        if (order.buyerId !== client.id) throw new Error('Unauthorized: Order does not belong to this buyer');

        // Only allow deletion if order is not in final state
        if (order.status === 'CONFIRMED') throw new Error('Cannot delete confirmed orders');

        // Release any reserved stock
        if (order.harvestId && ['PENDING_BUYER', 'PENDING_FARMER'].includes(order.status)) {
            const harvestData = await ctx.stub.getState(order.harvestId);
            const harvest = JSON.parse(harvestData.toString());
            harvest.availableQuantity += order.quantity;
            harvest.reservedQuantity -= order.quantity;
            await ctx.stub.putState(order.harvestId, Buffer.from(JSON.stringify(harvest)));
        }

        // Delete the order
        await ctx.stub.deleteState(orderId);
    }
}