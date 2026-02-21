const { createWorker } = require("tesseract.js");
const sharp = require("sharp");
const { sendNotification } = require("./notificationService");

/**
 * OCR Service - Handles Sri Lankan payment slip OCR processing and verification
 */

async function performOCR(imageBuffer, expectedAmount) {
  const worker = await createWorker("eng");

  try {
    const {
      data: { text, confidence },
    } = await worker.recognize(imageBuffer);

    const extractedData = {
      rawText: text,
      confidence: Math.round(confidence),
      amount: extractAmount(text, expectedAmount),
      date: extractDate(text),
      reference: extractReference(text),
      bank: extractBank(text),
      timestamp: new Date().toISOString(),
    };

    await worker.terminate();
    return extractedData;
  } catch (error) {
    await worker.terminate();
    throw new Error(`OCR Processing Failed: ${error.message}`);
  }
}

/**
 * Optimize image for OCR processing
 * 
 */
async function optimizeImageForOCR(imageBuffer) {
  // Scales up the image without enlarging already huge files,
  // applies greyscale, stretches contrast, and sharpens heavily for Tesseract.
  return await sharp(imageBuffer)
    .resize(2000, null, { withoutEnlargement: true })
    .greyscale()
    .normalize()
    .linear(1.2, -10) // Slight contrast bump for faint thermal receipts
    .sharpen({ sigma: 1, m1: 1.5, m2: 0.5, x1: 2, y2: 10, y3: 20 })
    .toBuffer();
}

/**
 * Extract amount from OCR text
 */
function extractAmount(text, expectedAmount) {
  const patterns = [
    // Matches LKR, Rs., Amount, Total, Pay, Value
    /(?:(?:Rs\.?|LKR|Amount|Total|Sum|Pay|Paid|Value)[\s\.:]*)([\d,]+\.\d{2})/gi,
    /([\d,]+\.?\d*)\s*\/=/g,
    /\b(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\b/g,
  ];

  const amounts = [];
  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      const numStr = match[1].replace(/,/g, "");
      const num = parseFloat(numStr);
      if (!isNaN(num) && num > 0) {
        amounts.push(num);
      }
    }
  }

  if (amounts.length === 0) return null;

  // Return amount closest to expected amount
  amounts.sort((a, b) => Math.abs(a - expectedAmount) - Math.abs(b - expectedAmount));
  return amounts[0];
}

/**
 * Extract date from OCR text handling standard Sri Lankan formats
 */
function extractDate(text) {
  const patterns = [
    // 15-Feb-2026, 15 Feb 2026, 15/Feb/2026
    /(\d{1,2})[-\s/]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s/]+(\d{4})/gi,
    // YYYY-MM-DD
    /(\d{4})[-\/.](\d{2})[-\/.](\d{2})/g,
    // DD/MM/YYYY or DD-MM-YYYY (Standard SL)
    /(\d{2})[-\/.](\d{2})[-\/.](\d{4})/g,
  ];

  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      try {
        let date;
        if (match.length === 4) {
          if (match[2].match(/^[a-zA-Z]+$/)) {
            // Textual month: match[1]=DD, match[2]=MMM, match[3]=YYYY
            date = new Date(`${match[1]} ${match[2]} ${match[3]}`);
          } else if (match[1].length === 4) {
            // YYYY-MM-DD: match[1]=YYYY, match[2]=MM, match[3]=DD
            date = new Date(`${match[1]}-${match[2]}-${match[3]}`);
          } else {
            // DD/MM/YYYY: match[1]=DD, match[2]=MM, match[3]=YYYY (Force SL format)
            date = new Date(`${match[3]}-${match[2]}-${match[1]}`);
          }
        }
        
        if (date && !isNaN(date.getTime())) {
          return date.toISOString().split("T")[0];
        }
      } catch (e) {
        continue;
      }
    }
  }
  return null;
}

/**
 * Extract reference/transaction number
 */
function extractReference(text) {
  const patterns = [
    // Matches common app/bank markers
    /(?:Reference|Ref|Txn|Transaction|Trace|Journal|Seq|Receipt|Ticket)(?:\s+No|\s+ID|#|:)[\s]*([A-Z0-9-]{6,16})/gi,
    // Special interbank transfers
    /\bCEFT[A-Z0-9-]{8,}\b/gi,
    /\bSLIPS[A-Z0-9-]{8,}\b/gi,
    // Fallback for long alphanumeric codes often used by payment gateways
    /\b([A-Z0-9]{8,15})\b/g 
  ];

  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      const ref = match[1] || match[0]; // match[1] for groups, match[0] for word boundaries
      const refUpper = ref.toUpperCase();
      
      const blacklist = ["SUCCESSFUL", "PENDING", "FAILED", "TRANSFER", "PAYMENT", "RECEIPT", "COMPLETED"];
      if (!blacklist.includes(refUpper) && !/^(19|20)\d{2}$/.test(ref)) {
        return ref; // Return first valid hit
      }
    }
  }
  return null;
}

/**
 * Extract Sri Lankan bank or payment gateway
 */
function extractBank(text) {
  const entities = [
    "Bank of Ceylon", "BOC", "Commercial Bank", "ComBank", "COMB",
    "Sampath", "Hatton National Bank", "HNB", "Nations Trust Bank", "NTB",
    "Seylan", "DFCC", "People's Bank", "National Development Bank", "NDB",
    "Pan Asia", "PABC", "Amana", "Cargills", "National Savings Bank", "NSB",
    "Standard Chartered", "HSBC", "State Bank of India", "SBI",
    "FriMi", "Flash", "JustPay", "LankaPay", "CEFT", "SLIPS",
    "iPay", "PayHere", "DirectPay", "Genie", "Q+ App", "OrelPay"
  ];

  const textLower = text.toLowerCase();
  for (const entity of entities) {
    if (textLower.includes(entity.toLowerCase())) {
      return entity;
    }
  }
  return "Unknown Bank/Gateway";
}

/**
 * Evaluate OCR results with granular error reporting
 */
function evaluateOCR(ocrData, expectedAmount, fraudScore = { score: 0, flags: [] }) {
  const { confidence, amount, date, reference, bank } = ocrData;
  const errorMessages = [];

  // 1. Amount Verification
  if (!amount) {
    errorMessages.push("Could not detect a payment amount on the slip.");
  } else {
    // 95% match threshold to account for minor OCR misreads of decimals
    const amountMatch = (1 - Math.abs(amount - expectedAmount) / expectedAmount) * 100;
    if (amountMatch < 95) {
      errorMessages.push(`Amount mismatch. We expected LKR ${expectedAmount.toLocaleString()}, but detected LKR ${amount.toLocaleString()}.`);
    }
  }

  // 2. Date Verification (Strict 7 Days)
  if (!date) {
    errorMessages.push("Could not detect a valid transaction date.");
  } else if (!isDateWithinDays(date, 7)) {
    errorMessages.push(`The transaction date (${date}) is older than the allowed 7-day window.`);
  }

  // 3. Reference Verification
  if (!reference) {
    errorMessages.push("Could not detect a valid Reference, Trace, or Journal Number.");
  }

  // 4. Fraud & Quality Check
  if (fraudScore.score >= 70) {
    errorMessages.push(`Security check failed: ${fraudScore.flags.join(", ")}`);
  }
  if (confidence < 60) {
    errorMessages.push("Image quality is too poor for a reliable automated read.");
  }

  // Final Decision
  if (errorMessages.length > 0) {
    return {
      verificationStatus: "REJECTED",
      paymentStatus: "FAILED",
      reasons: errorMessages, // Granular messages for the user
      notes: `Failed checks. Conf: ${confidence}%, Bank: ${bank}`
    };
  }

  return {
    verificationStatus: "AUTO_APPROVED",
    paymentStatus: "AUTHORIZED",
    reasons: [],
    notes: `Auto-approved: LKR ${amount} on ${date} via ${bank}. Ref: ${reference}`
  };
}

function isDateWithinDays(dateStr, days) {
  try {
    const slipDate = new Date(dateStr);
    const now = new Date();
    // Reset times to midnight for accurate day calculation
    slipDate.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    
    const diffTime = now - slipDate; // Ensures future dates aren't falsely flagged as "within"
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays >= 0 && diffDays <= days;
  } catch (e) {
    return false;
  }
}

/**
 * Send notifications mapping the granular errors
 */
async function sendVerificationNotifications(buyerId, orderId, evaluationResult, expectedAmount) {
  const { verificationStatus, reasons } = evaluationResult;

  const notif = {
    category: "payment",
    title: verificationStatus === "AUTO_APPROVED" ? "✅ Payment Verified" : "❌ Payment Verification Failed",
    severity: verificationStatus === "AUTO_APPROVED" ? "success" : "error",
    body: verificationStatus === "AUTO_APPROVED" 
      ? `Your payment of LKR ${expectedAmount.toLocaleString()} for Order #${orderId} has been verified.`
      : `Your payment slip for Order #${orderId} could not be verified due to the following reasons:\n\n• ${reasons.join("\n• ")}\n\nPlease re-upload a clear image.`
  };

  try {
    await sendNotification(buyerId, notif);
  } catch (error) {
    console.error("⚠️ Skipping notification (service issue):", error.message);
  }
}

module.exports = {
  performOCR,
  optimizeImageForOCR,
  extractAmount,
  extractDate,
  extractReference,
  extractBank,
  evaluateOCR,
  isDateWithinDays,
  sendVerificationNotifications,
};