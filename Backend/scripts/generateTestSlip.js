const path = require("path");
const { saveTestPaymentSlip } = require("../utils/testPaymentSlipGenerator");

/**
 * Generate a test payment slip for OCR testing
 */
async function main() {
  console.log("🎨 Generating test payment slip...\n");

  const options = {
    amount: 10000,
    reference: "602565",
    date: new Date().toLocaleDateString("en-GB"), // Today's date in DD/MM/YYYY
    currency: "LKR",
    bank: "Bank of Ceylon",
    senderName: "Akalanka Buyer",
    senderAccount: "1234567890",
    receiverName: "FreshRoute Platform",
    receiverAccount: "0987654321",
    transactionType: "Online Transfer",
  };

  const outputPath = path.join(
    __dirname,
    "..",
    "test-payment-slip-10000-LKR.png",
  );

  try {
    await saveTestPaymentSlip(outputPath, options);

    console.log("\n📋 Payment Slip Details:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Bank:          ${options.bank}`);
    console.log(
      `Amount:        ${options.currency} ${options.amount.toLocaleString()}`,
    );
    console.log(`Reference:     ${options.reference}`);
    console.log(`Date:          ${options.date}`);
    console.log(`From:          ${options.senderName}`);
    console.log(`To:            ${options.receiverName}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\n✅ Ready to upload from mobile app!");
    console.log("\n💡 File location:");
    console.log(`   ${outputPath}`);
    console.log("\n📱 Transfer this image to your phone and upload it.");
    console.log("   Expected result: AUTO_APPROVED ✅");
  } catch (error) {
    console.error("❌ Error generating test slip:", error.message);

    if (error.message.includes("canvas")) {
      console.log("\n⚠️  Missing dependency. Install canvas:");
      console.log("   npm install canvas");
    }
  }
}

main();
