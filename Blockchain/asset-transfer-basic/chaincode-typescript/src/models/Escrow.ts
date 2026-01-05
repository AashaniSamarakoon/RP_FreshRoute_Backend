export enum EscrowStatus {
    PENDING_DEPOSIT = 'PENDING_DEPOSIT',
    FUNDS_LOCKED = 'FUNDS_LOCKED',       // Safe state
    RELEASED = 'RELEASED',               // Paid to Farmer
    REFUNDED = 'REFUNDED',               // Returned to Buyer
    DISPUTED = 'DISPUTED'                // Manual intervention needed
}

export interface Escrow {
    id: string;             // "ESCROW_ORDER_123"
    docType: 'escrow';
    
    orderId: string;
    buyerId: string;
    farmerId: string;
    
    amount: number;
    currency: string;
    platformFee: number;    // Optional: Platform revenue
    
    status: EscrowStatus;
    
    disputeReason?: string;
    createdAt: string;
    releasedAt?: string;
}