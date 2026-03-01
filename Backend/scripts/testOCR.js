const fs = require("fs");
const path = require("path");
const {
  performOCR,
  optimizeImageForOCR,
  evaluateOCR,
} = require("../Services/ocrService");

/**
 * Automated Test Script for Sri Lankan Payment Slip OCR Pipeline
 */
async function testOCR() {
  console.log("🔍 Initiating Sri Lankan Bank Slip OCR Test...\n");

  const imageFile = path.join(__dirname, "..", "test-payment-slip-10000-LKR.png");

  if (!fs.existsSync(imageFile)) {
    console.error("❌ Test image not found at:", imageFile);
    console.log("💡 Tip: Run your slip generation script first, or place a test image in the root directory.");
    process.exit(1);
  }

  try {
    console.log("📸 Loading and optimizing image...");
    const imageBuffer = fs.readFileSync(imageFile);
    
    // Step 1: Pre-process the image for better Tesseract contrast
    const optimizedImage = await optimizeImageForOCR(imageBuffer);

    console.log("🤖 Running Tesseract Engine (This might take a few seconds)...\n");
    const expectedAmount = 10000;
    
    // Performance profiling: Track how long the OCR takes
    const startTime = Date.now();
    const ocrData = await performOCR(optimizedImage, expectedAmount);
    const endTime = Date.now();

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📝 RAW OCR TEXT (Excerpt):");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    // Trimmed to avoid terminal spam if the image is noisy
    console.log(ocrData.rawText.trim() || "❌ NO TEXT DETECTED");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    console.log("📊 EXTRACTED DATA:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`⏱️  Processing Time: ${(endTime - startTime) / 1000} seconds`);
    console.log(`🎯 Confidence:      ${ocrData.confidence}%`);
    console.log(`💰 Amount:          ${ocrData.amount ? `LKR ${ocrData.amount.toLocaleString()}` : "❌ NOT FOUND"}`);
    console.log(`📅 Date:            ${ocrData.date || "❌ NOT FOUND"}`);
    console.log(`🏷️  Reference:       ${ocrData.reference || "❌ NOT FOUND"}`);
    console.log(`🏦 Bank/Gateway:    ${ocrData.bank || "❌ NOT FOUND"}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    console.log("✅ VERIFICATION ANALYSIS:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    // Pass to our newly updated evaluation function
    const fraudScore = { score: 0, flags: [] }; 
    const verificationResult = evaluateOCR(ocrData, expectedAmount, fraudScore);

    // Dynamic output based on the new service structure
    if (verificationResult.verificationStatus === "AUTO_APPROVED") {
      console.log("🟢 STATUS: AUTO_APPROVED");
      console.log(`📝 Notes:  ${verificationResult.notes}`);
      console.log("\n🎉 SUCCESS! The pipeline successfully extracted and validated all required fields.");
      console.log("   Upload this from your mobile app and it will auto-approve.\n");
    } else {
      console.log("🔴 STATUS: REJECTED\n");
      console.log("❌ FAILURES DETECTED:");
      
      // Loop through the granular reasons we set up in the service
      verificationResult.reasons.forEach(reason => {
        console.log(`  • ${reason}`);
      });
      
      console.log(`\n📝 Notes: ${verificationResult.notes}`);
      console.log("\n⚠️  The slip requires manual review or the OCR preprocessing parameters need tuning.\n");
    }

  } catch (error) {
    console.error("\n💥 CRITICAL FAILURE IN OCR PIPELINE:");
    console.error(error.message);
  }
}

// Execute
testOCR();