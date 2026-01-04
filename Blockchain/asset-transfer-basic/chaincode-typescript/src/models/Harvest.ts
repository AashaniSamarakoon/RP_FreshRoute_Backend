export enum HarvestStatus {
    PREDICTED = 'PREDICTED',       // Farmer expects this amount
    READY_FOR_SALE = 'READY',      // Confirmed and listed
    SOLD = 'SOLD',                 // Fully bought
    EXPIRED = 'EXPIRED',           // Past shelf life
    QUALITY_FAILED = 'FAILED'      // Rejected by inspector
}

export interface Harvest {
    id: string;             // e.g., "HARVEST_001"
    docType: 'harvest';
    farmerId: string;
    fruitId: string;        // e.g., "MANGO_ALPHONSO"
    variety: string;
    
    // Quantity tracking
    totalQuantity: number;
    availableQuantity: number;
    unit: string;           // 'kg', 'ton', 'crate'
    
    pricePerUnit: number;
    currency: string;       // 'LKR' or 'USD'
    
    harvestDate: string;    // Predicted or Actual
    expiryDate: string;
    
    location: string;       // GPS or Region
    status: HarvestStatus;
    qualityGrade?: string;  // 'A', 'B', 'C' (Added by Quality Check)
}