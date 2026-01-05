export enum OrderStatus {
    CREATED = 'CREATED',           // Buyer placed order
    PENDING_MATCH = 'PENDING_MATCH', // Waiting for transporter
    MATCHED = 'MATCHED',           // Transporter assigned
    PICKED_UP = 'PICKED_UP',       // Transporter has goods
    IN_TRANSIT = 'IN_TRANSIT',     // On the way
    DELIVERED = 'DELIVERED',       // Buyer received
    COMPLETED = 'COMPLETED',       // Escrow released
    CANCELLED = 'CANCELLED'
}

export interface Order {
    id: string;             // "ORDER_123"
    docType: 'order';
    
    // Relationship links
    harvestId: string;
    buyerId: string;
    sellerId: string;       // Farmer ID
    transporterId?: string; // Assigned later via LogisticsContract
    
    // Order details
    quantity: number;
    totalPrice: number;
    deliveryAddress: string;
    
    // Logistics tracking
    pickupDate?: string;
    deliveryDate?: string;
    currentLocation?: string; // Updated by Transporter
    
    status: OrderStatus;
    paymentStatus: 'UNPAID' | 'ESCROW_LOCKED' | 'RELEASED' | 'REFUNDED';
    createdAt: string;
    updatedAt: string;
}