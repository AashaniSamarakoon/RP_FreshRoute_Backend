const crypto = require("crypto");
const { supabaseAdmin: supabase } = require("../../utils/supabaseClient");
const { getContract } = require("../../Services/blockchain/contractService");
const { onNewStockAdded } = require("../../Services/matchingService");
const { uploadImageToSupabase } = require("../../utils/uploadUtils");

// Get stock by ID
const getStockById = async (req, res) => {
  try {
    const { stockId } = req.params;

    if (!stockId) {
      return res.status(400).json({ message: "Stock ID is required" });
    }

    // first fetch the stock row; include farmer.user_id so we can load the profile separately
    const { data, error } = await supabase
      .from("estimated_stock")
      .select("*, farmer:farmer_id (user_id)")
      .eq("id", stockId)
      .single();

    // if we got a farmer id, grab the user record for name etc.
    if (data && data.farmer && data.farmer.user_id) {
      const { data: userInfo } = await supabase
        .from("users")
        .select("id,first_name,last_name")
        .eq("id", data.farmer.user_id)
        .single();
      data.farmer.user = userInfo || null;
    }

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
        const hash = crypto
          .createHash("sha256")
          .update(file.buffer)
          .digest("hex");
        imageHashes.push(hash);

        // B. Upload
        const fileName = `${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
        const url = await uploadImageToSupabase(file.buffer, fileName);
        publicUrls.push(url);
      }
    }

    // Fetch Farmer record (table now uses user_id as primary key)
    const { data: farmerData } = await supabase
      .from("farmers")
      .select("user_id")
      .eq("user_id", userId)
      .single();

    if (!farmerData)
      return res.status(404).json({ message: "Farmer not found" });

    // --- SAVE TO SUPABASE (Arrays) ---
    const { data, error } = await supabase
      .from("estimated_stock")
      .insert([
        {
          // the farmer_id column refers directly to the user_id in the updated schema
          farmer_id: farmerData.user_id,
          fruit_type,
          variant,
          quantity: parseInt(quantity),
          grade,
          estimated_harvest_date,
          price_per_kg: price_per_unit || 0,
          // Saving Arrays directly
          image_url: publicUrls,
          image_hash: imageHashes,
        },
      ])
      .select("*")
      .single();

    if (error) throw new Error("Supabase insert failed: " + error.message);

    // --- SAVE TO BLOCKCHAIN ---
    const harvestId = `HARVEST_${data.id}`;
    let blockchainStatus = "Pending";

    try {
      const { contract, close } = await getContract(userId, "StockContract");
      const txId = await submitWithTx(
        contract,
        "CreateHarvest",
        harvestId,
        `${fruit_type}_${variant}`,
        quantity.toString(),
        (price_per_unit || "0").toString(),
        JSON.stringify(imageHashes),
        grade || "",
        estimated_harvest_date || new Date().toISOString().split("T")[0],
      );
      await close();
      blockchainStatus = "Success";
      console.log(`[Blockchain] CreateHarvest Success: HARVEST_${data.id} (tx=${txId})`);
      data.blockchainTxId = txId;
      // store txId in Supabase record for future reference
      try {
        await supabase
          .from("estimated_stock")
          .update({ blockchain_tx_id: txId })
          .eq("id", data.id);
      } catch (_e) {
        console.warn("Failed to persist blockchain txId for stock", data.id, _e.message);
      }
    } catch (bcError) {
      console.error("Blockchain Failed:", bcError);
      blockchainStatus = "Failed";
    }

    await onNewStockAdded(data.id);

    return res.status(201).json({
      success: true,
      stock: data,
      blockchainStatus,
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

    if (fetchError || !existingStock)
      return res.status(404).json({ message: "Stock not found" });

    // 2. Prepare Updates
    const { quantity, price_per_unit, status } = req.body;

    let updateData = {
      quantity: quantity ? parseInt(quantity) : existingStock.quantity,
      price_per_kg: price_per_unit
        ? parseFloat(price_per_unit)
        : existingStock.price_per_kg,
      // Keep existing image data by default
      image_url: existingStock.image_url,
      image_hash: existingStock.image_hash,
    };

    // --- 3. HANDLE NEW IMAGE (If uploaded) ---
    let newImageHash = "";

    if (req.file) {
      console.log("Updating Stock Image...");

      // A. Calculate NEW Hash
      const fileBuffer = req.file.buffer;
      newImageHash = crypto
        .createHash("sha256")
        .update(fileBuffer)
        .digest("hex");

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

    if (updateError)
      throw new Error("Database update failed: " + updateError.message);

    // 5. UPDATE BLOCKCHAIN (The Critical Step)
    const harvestId = `HARVEST_${stockId}`;
    let blockchainStatus = "Skipped (No Change)";

    try {
      const { contract, close } = await getContract(userId, "StockContract");
      const txId = await submitWithTx(
        contract,
        "UpdateHarvest",
        harvestId,
        updateData.quantity.toString(),
        updateData.price_per_kg.toString(),
        status || "FRESH",
        newImageHash,
      );
      await close();
      blockchainStatus = "Success";
      console.log(`[Blockchain] UpdateHarvest Success: HARVEST_${stockId} (tx=${txId})`);
      // persist tx id on update as well
      try {
        await supabase
          .from("estimated_stock")
          .update({ blockchain_tx_id: txId })
          .eq("id", stockId);
      } catch (_e) {
        console.warn("Failed to persist blockchain txId for stock update", stockId, _e.message);
      }
    } catch (bcError) {
      console.error("Blockchain Update Failed:", bcError);
      blockchainStatus = "Failed";
    }

    return res.json({
      success: true,
      message: "Stock updated successfully",
      blockchainStatus,
      imageUrl: updateData.image_url, // Send back new URL to Frontend
    });
  } catch (err) {
    console.error("Update Error:", err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/farmer/estimated-stocks  – list all harvests owned by the logged-in farmer
const getEstimatedStocks = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // Optional query params for filtering
    const { status, fruit_type, grade } = req.query;

    let query = supabase
      .from("estimated_stock")
      .select(
        "id, fruit_type, variant, quantity, grade, estimated_harvest_date, price_per_kg, image_url, status, blockchain_tx_id, created_at",
      )
      .eq("farmer_id", userId)
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (fruit_type) query = query.ilike("fruit_type", `%${fruit_type}%`);
    if (grade) query = query.eq("grade", grade);

    const { data, error } = await query;

    if (error) throw new Error(error.message);

    return res.status(200).json({ success: true, stocks: data });
  } catch (err) {
    console.error("GetEstimatedStocks Error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

module.exports = { submitPredictStock, getStockById, updateStock, getEstimatedStocks };
