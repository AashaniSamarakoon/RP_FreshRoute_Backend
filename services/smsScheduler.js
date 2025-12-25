// Daily SMS scheduler - runs at morning time to send forecast alerts
const cron = require("node-cron");
const { sendBatchSMS } = require("./smsService");
const {
  getFreshForecastsForSMS,
  getSMSSubscribedFarmers,
  compileSMSBatch,
  logSMSSend,
} = require("./forecastSMSBuilder");

const MORNING_HOUR = process.env.SMS_MORNING_HOUR || 6; // 6 AM
const TIMEZONE = process.env.SMS_TIMEZONE || "Asia/Colombo";

let schedulerStarted = false;

/**
 * Send morning forecast SMS batch
 * Called daily at configured hour
 */
async function sendMorningForecastSMS() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const mins = String(now.getMinutes()).padStart(2, "0");

  console.log(`\n📅 [${hours}:${mins}] Running daily SMS forecast job...`);

  try {
    let forecasts = [];
    let farmers = [];

    try {
      [forecasts, farmers] = await Promise.all([
        getFreshForecastsForSMS(24), // Last 24 hours
        getSMSSubscribedFarmers(),
      ]);
    } catch (dbErr) {
      console.warn("⚠️ Database query error (may need schema):", dbErr.message);
      console.log("💡 Please ensure sms_logs, forecast_daily, and users tables exist in Supabase");
      return;
    }

    if (!forecasts || !forecasts.length) {
      console.log("⚠️ No recent forecasts found. Skipping SMS send.");
      return;
    }

    if (!farmers || !farmers.length) {
      console.log("⚠️ No farmers with SMS enabled found. Skipping SMS send.");
      return;
    }

    console.log(`✓ Found ${forecasts.length} fresh forecasts, ${farmers.length} farmers`);

    const smsBatch = compileSMSBatch(forecasts, farmers);
    console.log(`📱 Sending ${smsBatch.length} SMS messages...`);

    const sendResults = await sendBatchSMS(smsBatch.map((s) => ({ phone: s.phone, message: s.message })));

    // Log results
    for (let i = 0; i < smsBatch.length; i++) {
      const batch = smsBatch[i];
      const result = sendResults[i];

      await logSMSSend(
        batch.farmer_id,
        batch.forecast_ids,
        batch.phone,
        result.status === "fulfilled" ? "sent" : "failed",
        result.status === "rejected" ? result.result : null
      );

      if (result.status === "fulfilled") {
        console.log(`✓ SMS sent to farmer ${batch.farmer_id}`);
      } else {
        console.error(`✗ SMS failed for farmer ${batch.farmer_id}: ${result.result}`);
      }
    }

    console.log("✓ Morning SMS job completed.\n");
  } catch (err) {
    console.error("❌ Morning SMS job error:", err.message);
  }
}

/**
 * Start the daily SMS scheduler
 * Runs at {MORNING_HOUR}:00 every day
 */
function startSMSScheduler() {
  if (schedulerStarted) {
    console.log("ℹ️ SMS scheduler already started");
    return;
  }

  // Cron: minute hour * * * = every day at specified hour
  const cronExpression = `0 ${MORNING_HOUR} * * *`;

  cron.schedule(cronExpression, sendMorningForecastSMS, {
    timezone: TIMEZONE,
  });

  console.log(`✓ SMS scheduler started: runs daily at ${MORNING_HOUR}:00 ${TIMEZONE}`);
  schedulerStarted = true;
}

/**
 * Manual trigger for testing SMS job
 */
async function triggerSMSNow() {
  console.log("🔔 Manual SMS trigger...");
  await sendMorningForecastSMS();
}

module.exports = { startSMSScheduler, triggerSMSNow };
