// const { getContract } = require("../../Services/blockchain/contractService");
// const { getDigitalPassport } = require("../../utils/identityUtils");

// // --- HELPER: The "Proof-of-Performance" Algorithm ---
// /**
//  * Calculates a weighted Trust Score based on immutable Ledger History.
//  * Formula: 50% Success Rate + 30% On-Time Rate + 20% Quality Match
//  */
// const calculateTrustScore = (orderHistory) => {
//     if (!orderHistory || orderHistory.length === 0) {
//         return { 
//             trustScore: "0", 
//             stars: "New", 
//             successRate: "0", 
//             onTimeRate: "0",
//             totalOrders: 0 
//         };
//     }

//     let successCount = 0;
//     let onTimeCount = 0;
//     let qualityMatchCount = 0;
//     const totalOrders = orderHistory.length;

//     orderHistory.forEach(order => {
//         // 1. Success Metric: Order was delivered (not cancelled/disputed)
//         if (order.status === 'DELIVERED') {
//             successCount++;

//             // 2. Timeliness Metric: Delivered on or before required date
//             // Blockchain dates are strings, convert to verify
//             const requiredDate = new Date(order.requiredDate).getTime();
//             const deliveredDate = new Date(order.updatedAt).getTime(); 
            
//             // Allow a 4-hour logistics buffer
//             if (deliveredDate <= requiredDate + (4 * 60 * 60 * 1000)) {
//                 onTimeCount++;
//             }

//             // 3. Quality Metric: No disputes recorded
//             if (!order.disputeStatus || order.disputeStatus === 'NONE') {
//                 qualityMatchCount++;
//             }
//         }
//     });

//     // Calculate Percentages
//     const successRate = (successCount / totalOrders) * 100;
//     const completedOrders = successCount > 0 ? successCount : 1; 
//     const onTimeRate = (onTimeCount / completedOrders) * 100;
//     const qualityRate = (qualityMatchCount / completedOrders) * 100;

//     // The Weighted Algorithm
//     const rawScore = (successRate * 0.5) + (onTimeRate * 0.3) + (qualityRate * 0.2);
    
//     // Convert to 5-Star Scale (e.g., 90/20 = 4.5)
//     const stars = (rawScore / 20).toFixed(1);

//     return {
//         totalOrders,
//         successRate: successRate.toFixed(1),
//         onTimeRate: onTimeRate.toFixed(1),
//         qualityRate: qualityRate.toFixed(1),
//         trustScore: rawScore.toFixed(1), // 0-100 Score
//         stars: stars // 0-5.0 Stars
//     };
// };

// // --- CONTROLLER: The "Trust Profile" API ---
// const getTrustProfile = async (req, res) => {
//     try {
//         const { targetUserId, role } = req.params; // The user being viewed (Farmer or Buyer)
//         const viewerId = req.user.id; // The user requesting the data

//         // 1. Fetch Immutable History from Blockchain
//         const { contract, close } = await getContract(viewerId, 'OrderContract');
        
//         // Define query based on who we are looking at
//         // If looking at a Farmer, we want orders where they were the 'seller'
//         const selector = role === 'farmer' 
//             ? { selector: { docType: 'order', sellerId: targetUserId } }
//             : { selector: { docType: 'order', buyerId: targetUserId } };

//         const historyBuffer = await contract.evaluateTransaction('queryBySelector', JSON.stringify(selector));
//         const history = JSON.parse(historyBuffer.toString());
//         await close();

//         // 2. Calculate the Trust Metrics (The Algorithm)
//         const trustMetrics = calculateTrustScore(history);

//         // 3. Fetch the Digital Passport (X.509 Cert)
//         const passport = await getDigitalPassport(targetUserId);

//         // 4. Construct the Research-Grade Response
//         res.json({
//             userId: targetUserId,
//             role: role,
            
//             // Performance Data (Calculated)
//             trustMetrics: {
//                 stars: trustMetrics.stars,
//                 reliabilityScore: trustMetrics.trustScore,
//                 totalTransactions: trustMetrics.totalOrders,
//                 successRate: trustMetrics.successRate + "%",
//                 onTimeDelivery: trustMetrics.onTimeRate + "%",
//             },

//             // Identity Data (Cryptographic)
//             digitalPassport: passport ? {
//                 isValid: true,
//                 serialNumber: passport.serialNumber,
//                 issuer: "FreshRoute CA (Hyperledger)",
//                 subject: passport.subject,
//                 expiryDate: new Date(passport.validTo).toLocaleDateString(),
//                 fingerprint: passport.fingerprint
//             } : { isValid: false, message: "Identity not found in wallet" },

//             // Raw Audit Trail (For the Timeline UI)
//             recentActivity: history.slice(0, 5).map(order => ({
//                 id: order.id,
//                 type: order.status, // e.g., 'DELIVERED'
//                 date: order.updatedAt,
//                 details: `${order.fruitType} - ${order.quantity}kg`,
//                 txId: order.txId || "Unavailable" // Assuming your chaincode saves txId
//             })),

//             verificationSource: "Hyperledger Fabric Ledger"
//         });

//     } catch (err) {
//         console.error("Trust Profile Error:", err);
//         res.status(500).json({ error: "Failed to verify trust profile: " + err.message });
//     }
// };

// module.exports = { getTrustProfile };


const { getDigitalPassport } = require("../../utils/identityUtils");

// --- TEST CONTROLLER: Identity Only ---
const getIdentityOnly = async (req, res) => {
    try {
        const { targetUserId } = req.params; 
        
        console.log(`Fetching Digital Passport for: ${targetUserId}`);

        // Only fetch the local wallet data (No Blockchain query needed)
        const passport = await getDigitalPassport(targetUserId);

        if (!passport) {
            return res.status(404).json({ 
                success: false, 
                message: `No identity found in wallet for ID: ${targetUserId}` 
            });
        }

        res.json({
            success: true,
            userId: targetUserId,
            digitalPassport: {
                serialNumber: passport.serialNumber,
                issuer: "FreshRoute CA (Hyperledger Fabric)",
                subject: passport.subject,
                validFrom: new Date(passport.validFrom).toLocaleString(),
                validTo: new Date(passport.validTo).toLocaleString(),
                fingerprint: passport.fingerprint
            }
        });

    } catch (err) {
        console.error("Identity Error:", err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = { 
    // ... keep your other exports ...
    getIdentityOnly 
};