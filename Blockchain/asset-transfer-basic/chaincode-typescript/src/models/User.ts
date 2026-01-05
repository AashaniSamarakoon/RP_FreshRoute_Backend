export enum ParticipantType {
    FARMER = 'farmer',
    BUYER = 'buyer',
    TRANSPORTER = 'transporter',
    ADMIN = 'admin'
}

export interface Participant {
    id: string;             // Supabase UUID or MSP ID
    docType: 'participant';
    name: string;
    type: ParticipantType;
    mspId: string;          // Org1MSP, Org2MSP, etc.
    organization: string;   // "FreshRoute Suppliers Co."
    address: string;
    balance: number;        // Wallet balance for platform
    reputation: number;     // 0-5 stars
    isVerified: boolean;    // KYC Status
    createdAt: string;
}