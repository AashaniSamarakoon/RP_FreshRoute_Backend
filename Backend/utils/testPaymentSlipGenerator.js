const { createCanvas } = require("canvas");
const fs = require("fs");

/**
 * Generate a test payment slip image for OCR testing
 * @param {Object} options - Payment slip details
 * @returns {Promise<Buffer>} - PNG image buffer
 */
async function generateTestPaymentSlip(options = {}) {
  const {
    amount = 10000,
    reference = "602565",
    date = "03/02/2026",
    currency = "LKR",
    bank = "Bank of Ceylon",
    senderName = "John Doe",
    senderAccount = "1234567890",
    receiverName = "FreshRoute Payment",
    receiverAccount = "0987654321",
    transactionType = "Online Transfer",
  } = options;

  // Create canvas (A5 size at 300 DPI for good OCR)
  const width = 1748;
  const height = 2480;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // White background
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);

  // Bank header background
  ctx.fillStyle = "#003366";
  ctx.fillRect(0, 0, width, 200);

  // Bank logo/name
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 80px Arial";
  ctx.textAlign = "center";
  ctx.fillText(bank, width / 2, 130);

  // Transaction receipt title
  ctx.fillStyle = "#000000";
  ctx.font = "bold 60px Arial";
  ctx.fillText("PAYMENT RECEIPT", width / 2, 300);

  // Draw border
  ctx.strokeStyle = "#003366";
  ctx.lineWidth = 4;
  ctx.strokeRect(100, 250, width - 200, height - 400);

  // Content area
  let y = 450;
  const leftMargin = 200;
  const lineHeight = 100;

  // Helper function to draw label-value pairs
  const drawField = (label, value, yPos) => {
    ctx.fillStyle = "#666666";
    ctx.font = "40px Arial";
    ctx.textAlign = "left";
    ctx.fillText(label + ":", leftMargin, yPos);

    ctx.fillStyle = "#000000";
    ctx.font = "bold 50px Arial";
    ctx.fillText(value, leftMargin + 500, yPos);
  };

  // Transaction details
  drawField("Transaction Type", transactionType, y);
  y += lineHeight;

  drawField("Date", date, y);
  y += lineHeight;

  drawField("Reference No", reference, y);
  y += lineHeight + 50;

  // Separator line
  ctx.strokeStyle = "#CCCCCC";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(leftMargin, y);
  ctx.lineTo(width - leftMargin, y);
  ctx.stroke();
  y += 80;

  // From section
  ctx.fillStyle = "#003366";
  ctx.font = "bold 45px Arial";
  ctx.fillText("FROM:", leftMargin, y);
  y += lineHeight;

  drawField("Name", senderName, y);
  y += lineHeight;

  drawField("Account", senderAccount, y);
  y += lineHeight + 50;

  // Separator line
  ctx.strokeStyle = "#CCCCCC";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(leftMargin, y);
  ctx.lineTo(width - leftMargin, y);
  ctx.stroke();
  y += 80;

  // To section
  ctx.fillStyle = "#003366";
  ctx.font = "bold 45px Arial";
  ctx.fillText("TO:", leftMargin, y);
  y += lineHeight;

  drawField("Name", receiverName, y);
  y += lineHeight;

  drawField("Account", receiverAccount, y);
  y += lineHeight + 50;

  // Separator line
  ctx.strokeStyle = "#CCCCCC";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(leftMargin, y);
  ctx.lineTo(width - leftMargin, y);
  ctx.stroke();
  y += 80;

  // Amount section (most important for OCR)
  ctx.fillStyle = "#003366";
  ctx.font = "bold 50px Arial";
  ctx.fillText("AMOUNT:", leftMargin, y);
  y += lineHeight + 20;

  // Large amount display
  ctx.fillStyle = "#000000";
  ctx.font = "bold 90px Arial";
  const amountText = `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  ctx.fillText(amountText, leftMargin, y);
  y += lineHeight;

  // Alternative formats for better OCR
  ctx.font = "45px Arial";
  ctx.fillStyle = "#333333";
  ctx.fillText(`Rs. ${amount.toLocaleString()}/=`, leftMargin, y);
  y += lineHeight + 50;

  // Status
  y += 100;
  ctx.fillStyle = "#00AA00";
  ctx.font = "bold 60px Arial";
  ctx.textAlign = "center";
  ctx.fillText("✓ TRANSACTION SUCCESSFUL", width / 2, y);

  // Footer
  y = height - 250;
  ctx.fillStyle = "#666666";
  ctx.font = "35px Arial";
  ctx.fillText("This is a computer-generated receipt", width / 2, y);
  y += 60;
  ctx.fillText(
    `Generated on ${new Date().toLocaleDateString("en-GB")}`,
    width / 2,
    y,
  );

  // Convert to buffer
  return canvas.toBuffer("image/png");
}

/**
 * Save test payment slip to file
 */
async function saveTestPaymentSlip(filePath, options) {
  const buffer = await generateTestPaymentSlip(options);
  fs.writeFileSync(filePath, buffer);
  console.log(`✅ Test payment slip saved to: ${filePath}`);
  return filePath;
}

module.exports = {
  generateTestPaymentSlip,
  saveTestPaymentSlip,
};
