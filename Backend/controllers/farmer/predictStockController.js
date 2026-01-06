const crypto = require('crypto');
const { supabase } = require("../../utils/supabaseClient");
const { getContract } = require("../../Services/blockchain/contractService");
const { onNewStockAdded } = require("../../Services/matchingService");
const { uploadImageToSupabase } = require("../../utils/uploadUtils")

// Get stock by ID
const getStockById = async (req, res) => {
  try {
    const { stockId } = req.params;

    if (!stockId) {
      return res.status(400).json({ message: "Stock ID is required" });
    }

    const { data, error } = await supabase
      .from("estimated_stock")
      .select(`*, farmer:farmer_id (id, user:user_id (id, name))`) // Simplified for brevity
      .eq("id", stockId)
      .single();

    if (error || !data) {
      return res.status(404).json({ message: "Stock not found" });
    }

    return res.status(200).json({ stock: data });
  } catch (err) {
    console.error("GetStockById Error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

const submitPredictStock = async (req, res) => {
    try {
        const userId = req.user && req.user.id;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const {
            fruit_type,
            variant,
            quantity,
            grade,
            estimated_harvest_date,
            price_per_unit,
        } = req.body;

        // --- IMAGE PROCESSING (Multiple Files) ---
        let publicUrls = [];
        let imageHashes = [];

        // Check if multiple files exist
        if (req.files && req.files.length > 0) {
            console.log(`Processing ${req.files.length} images...`);
            
            // Loop through each file
            for (const file of req.files) {
                // A. Hash
                const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
                imageHashes.push(hash);

                // B. Upload
                const fileName = `${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
                const url = await uploadImageToSupabase(file.buffer, fileName);
                publicUrls.push(url);
            }
        }

        // Fetch Farmer ID
        const { data: farmerData } = await supabase
            .from("farmer")
            .select("id")
            .eq("user_id", userId)
            .single();

        if (!farmerData) return res.status(404).json({ message: "Farmer not found" });

        // --- SAVE TO SUPABASE (Arrays) ---
        const { data, error } = await supabase
            .from("estimated_stock")
            .insert([{
                farmer_id: farmerData.id,
                fruit_type,
                variant,
                quantity: parseInt(quantity),
                grade,
                estimated_harvest_date,
                price_per_kg: price_per_unit || 0,
                // Saving Arrays directly
                image_url: publicUrls, 
                image_hash: imageHashes 
            }])
            .select("*")
            .single();

        if (error) throw new Error("Supabase insert failed: " + error.message);

        // --- SAVE TO BLOCKCHAIN ---
        const harvestId = `HARVEST_${data.id}`;
        let blockchainStatus = "Pending";

        try {
            const { contract, close } = await getContract(userId, "StockContract");
            
            await contract.submitTransaction(
                "CreateHarvest",
                harvestId,
                `${fruit_type}_${variant}`,
                quantity.toString(),
                (price_per_unit || "0").toString(),
                JSON.stringify(imageHashes) // Pass array as string if CC expects string, or update CC to accept string[]
            );
            // NOTE: If you updated Chaincode to accept string[], pass: ...imageHashes
            // If Chaincode expects a single string arg, use: JSON.stringify(imageHashes)
            
            await close();
            blockchainStatus = "Success";
        } catch (bcError) {
            console.error("Blockchain Failed:", bcError);
            blockchainStatus = "Failed";
        }

        await onNewStockAdded(data.id);

        return res.status(201).json({
            success: true,
            stock: data,
            blockchainStatus
        });

    } catch (err) {
        console.error("Submit Error:", err);
        return res.status(500).json({ message: err.message });
    }
};

const updateStock = async (req, res) => {
    try {
        const userId = req.user.id;
        const { stockId } = req.params; // The Supabase ID (e.g., UUID)
        
        // 1. Get Existing Data (to check ownership)
        const { data: existingStock, error: fetchError } = await supabase
            .from("estimated_stock")
            .select("*")
            .eq("id", stockId)
            .single();

        if (fetchError || !existingStock) return res.status(404).json({ message: "Stock not found" });

        // 2. Prepare Updates
        const { quantity, price_per_unit, status } = req.body;
        
        let updateData = {
            quantity: quantity ? parseInt(quantity) : existingStock.quantity,
            price_per_kg: price_per_unit ? parseFloat(price_per_unit) : existingStock.price_per_kg,
            // Keep existing image data by default
            image_url: existingStock.image_url,
            image_hash: existingStock.image_hash 
        };

        // --- 3. HANDLE NEW IMAGE (If uploaded) ---
        let newImageHash = ""; 
        
        if (req.file) {
            console.log("Updating Stock Image...");
            
            // A. Calculate NEW Hash
            const fileBuffer = req.file.buffer;
            newImageHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
            
            // B. Upload NEW Image to Supabase
            // We verify user ID in filename to prevent overwriting others' files
            const fileName = `${userId}_update_${Date.now()}.jpg`; 
            const publicUrl = await uploadImageToSupabase(fileBuffer, fileName);
            
            // C. Update the DB Object
            updateData.image_url = publicUrl;
            updateData.image_hash = newImageHash;
        }

        // 4. UPDATE SUPABASE
        const { error: updateError } = await supabase
            .from("estimated_stock")
            .update(updateData)
            .eq("id", stockId);

        if (updateError) throw new Error("Database update failed: " + updateError.message);

        // 5. UPDATE BLOCKCHAIN (The Critical Step)
        const harvestId = `HARVEST_${stockId}`;
        let blockchainStatus = "Skipped (No Change)";

        try {
            const { contract, close } = await getContract(userId, "StockContract");
            
            // Call the Updated Chaincode Function
            // Note: We pass 'newImageHash' (empty string if no new image)
            // The chaincode logic I gave you handles the empty string check.
            await contract.submitTransaction(
                "UpdateHarvest",
                harvestId,
                updateData.quantity.toString(),
                updateData.price_per_kg.toString(),
                status || "FRESH", // Default status if not provided
                newImageHash // <--- Send new hash (or empty string)
            );

            await close();
            blockchainStatus = "Success";
        } catch (bcError) {
            console.error("Blockchain Update Failed:", bcError);
            blockchainStatus = "Failed";
        }

        return res.json({
            success: true,
            message: "Stock updated successfully",
            blockchainStatus,
            imageUrl: updateData.image_url // Send back new URL to Frontend
        });

    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).json({ message: err.message });
    }
};

module.exports = { submitPredictStock, getStockById, updateStock };