const { supabase } = require("../../utils/supabaseClient");
const { getContract } = require("../../Services/blockchain/contractService");
const { onNewStockAdded } = require("../../Services/matchingService");

const submitPredictStock = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId)
      return res.status(401).json({ message: "Unauthorized: user id missing" });

    const {
      fruit_type,
      variant,
      quantity,
      grade,
      estimated_harvest_date,
      price_per_unit,
    } = req.body;

    // --- 1. VALIDATIONS ---
    if (typeof fruit_type !== "string" || typeof variant !== "string") {
      return res
        .status(400)
        .json({ message: "Fruit Type and Variant must be strings" });
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res
        .status(400)
        .json({ message: "quantity must be a positive integer" });
    }
    if (!grade || !["A", "B", "C"].includes(grade)) {
      return res.status(400).json({ message: "grade must be one of: A, B, C" });
    }
    if (!estimated_harvest_date) {
      return res
        .status(400)
        .json({ message: "estimated_harvest_date is required" });
    }

    // --- 2. FETCH FARMER PROFILE ---
    const { data: farmerData, error: farmerError } = await supabase
      .from("farmer")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (farmerError || !farmerData) {
      return res.status(404).json({ message: "No farmer profile found." });
    }

    const farmerId = farmerData.id;

    // --- 3. SAVE TO SUPABASE ---
    const { data, error } = await supabase
      .from("estimated_stock")
      .insert([
        {
          farmer_id: farmerId,
          fruit_type,
          variant,
          quantity,
          grade,
          estimated_harvest_date,
        },
      ])
      .select("*")
      .single();

    if (error) {
      throw new Error("Supabase insert failed: " + error.message);
    }

    // --- 4. SAVE TO BLOCKCHAIN (LEDGER) ---
    // We use the Supabase Record ID to link the Blockchain asset
    const harvestId = `HARVEST_${data.id}`;
    let blockchainStatus = "Pending";

    try {
      console.log(`Connecting to Blockchain for Harvest: ${harvestId}`);

      // Specify 'StockContract' as defined in your chaincode index.ts
      const { contract, close } = await getContract(userId, "StockContract");

      try {
        // Function signature from your StockContract.ts:
        // CreateHarvest(ctx, harvestId, fruitId, quantity, pricePerUnit)
        await contract.submitTransaction(
          "CreateHarvest",
          harvestId,
          `${fruit_type}_${variant}`, // combined fruit identifier
          quantity.toString(),
          (price_per_unit || "0").toString()
        );

        blockchainStatus = "Success";
        console.log(`Blockchain transaction successful for ${harvestId}`);
      } finally {
        await close();
      }
    } catch (blockchainError) {
      console.error("Blockchain Submission Failed:", blockchainError.message);
      blockchainStatus = "Failed: " + blockchainError.message;
      // Note: We don't block the response because Supabase succeeded,
      // but we inform the user/audit log.
    }

    // --- 5. TRIGGER MATCHING FOR RELEVANT OPEN ORDERS ---
    // This will check if any existing buyer orders can now be fulfilled
    await onNewStockAdded(data.id);

    return res.status(201).json({
      predictStock: data,
      blockchainId: harvestId,
      blockchainStatus: blockchainStatus,
    });
  } catch (err) {
    console.error("Controller Error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

module.exports = { submitPredictStock };
