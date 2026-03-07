// SMS service using Twilio
require("dotenv").config();
const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

let client = null;

// Only initialize Twilio if credentials are valid
if (accountSid && authToken && twilioPhoneNumber && accountSid.startsWith("AC")) {
  try {
    console.log(`[Twilio Init] Account SID: ${accountSid.substring(0, 5)}...`);
    console.log(`[Twilio Init] From Phone: ${twilioPhoneNumber}`);
    client = twilio(accountSid, authToken);
    console.log("✓ Twilio SMS service initialized successfully");
  } catch (err) {
    console.warn("⚠️ Twilio initialization failed:", err.message);
    console.warn("[Twilio Init] Check credentials in .env file");
    client = null;
  }
} else {
  console.warn(
    "⚠️ Twilio SMS service not configured. Set valid TWILIO_ACCOUNT_SID (must start with AC), TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in .env"
  );
  console.warn(`[Twilio Debug] SID exists: ${!!accountSid}, Token exists: ${!!authToken}, Phone exists: ${!!twilioPhoneNumber}`);
  if (accountSid) console.warn(`[Twilio Debug] SID starts with AC: ${accountSid.startsWith("AC")}`);
}

/**
 * Format phone number to international format (+94771234567)
 * @param {string} phone - Raw phone number
 * @returns {string} Formatted phone number
 */
function formatPhoneNumber(phone) {
  if (!phone) return null;
  
  // Remove spaces, dashes, parentheses
  let cleaned = phone.replace(/[\s\-()]/g, "");
  
  // If already starts with +, return as-is
  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  
  // If starts with 0, replace with +94 (Sri Lanka code)
  if (cleaned.startsWith("0")) {
    return "+94" + cleaned.substring(1);
  }
  
  // If 10 digits (US), assume +1
  if (cleaned.length === 10 && !cleaned.startsWith("1")) {
    return "+1" + cleaned;
  }
  
  // If doesn't start with +, assume +94 (Sri Lanka)
  if (!cleaned.startsWith("+")) {
    return "+94" + cleaned;
  }
  
  return cleaned;
}

/**
 * Send SMS to a single farmer
 * @param {string} toPhone - Phone number (any format, will be normalized)
 * @param {string} message - SMS text content
 * @returns {Promise<object>} Twilio response
 */
async function sendSMS(toPhone, message) {
  const formattedPhone = formatPhoneNumber(toPhone);
  
  if (!formattedPhone) {
    console.error("Invalid phone number:", toPhone);
    throw new Error("Invalid phone number format");
  }

  if (!client) {
    console.warn("⚠️ Twilio not configured. SMS not sent to", formattedPhone);
    return { sid: "MOCK_SID", status: "skipped", phone: formattedPhone };
  }

  try {
    console.log(`📤 Sending SMS to ${formattedPhone}...`);
    const result = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: formattedPhone,
    });
    console.log(`✓ SMS sent to ${formattedPhone}, SID: ${result.sid}, Status: ${result.status}`);
    return result;
  } catch (err) {
    console.error(`✗ Failed to send SMS to ${formattedPhone}:`, err.message);
    throw err;
  }
}

/**
 * Batch send SMS to multiple farmers
 * @param {Array<{phone: string, message: string}>} recipients
 * @returns {Promise<Array>} Array of send results
 */
async function sendBatchSMS(recipients) {
  const results = await Promise.allSettled(
    recipients.map((r) => sendSMS(r.phone, r.message))
  );
  return results.map((r, i) => {
    if (r.status === "rejected") {
      return {
        phone: recipients[i].phone,
        status: "rejected",
        result: r.reason?.message || "Unknown SMS error",
      };
    }

    const providerStatus = r.value?.status;
    if (providerStatus === "skipped") {
      return {
        phone: recipients[i].phone,
        status: "skipped",
        result: r.value,
      };
    }

    return {
      phone: recipients[i].phone,
      status: "fulfilled",
      result: r.value,
    };
  });
}

module.exports = { sendSMS, sendBatchSMS, formatPhoneNumber };