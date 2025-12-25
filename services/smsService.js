// SMS service using Twilio
const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

let client = null;

// Only initialize Twilio if credentials are valid
if (accountSid && authToken && twilioPhoneNumber && accountSid.startsWith("AC")) {
  try {
    client = twilio(accountSid, authToken);
    console.log("✓ Twilio SMS service initialized successfully");
  } catch (err) {
    console.warn("⚠️ Twilio initialization failed:", err.message);
    client = null;
  }
} else {
  console.warn(
    "⚠️ Twilio SMS service not configured. Set valid TWILIO_ACCOUNT_SID (must start with AC), TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in .env"
  );
}

/**
 * Send SMS to a single farmer
 * @param {string} toPhone - Phone number with country code (e.g. +94771234567)
 * @param {string} message - SMS text content
 * @returns {Promise<object>} Twilio response
 */
async function sendSMS(toPhone, message) {
  if (!client) {
    console.error("Twilio not configured. Skipping SMS send.");
    return { sid: "MOCK_SID", status: "skipped" };
  }

  try {
    const result = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: toPhone,
    });
    console.log(`✓ SMS sent to ${toPhone}, SID: ${result.sid}`);
    return result;
  } catch (err) {
    console.error(`✗ Failed to send SMS to ${toPhone}:`, err.message);
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
  return results.map((r, i) => ({
    phone: recipients[i].phone,
    status: r.status,
    result: r.value || r.reason?.message,
  }));
}

module.exports = { sendSMS, sendBatchSMS };
