const cron = require('node-cron');

const MORNING_HOUR = process.env.SMS_MORNING_HOUR || 6;
const TIMEZONE = process.env.SMS_TIMEZONE || 'Asia/Colombo';

const cronExpression = `0 ${MORNING_HOUR} * * *`;

console.log(`\n📋 SMS Scheduler Status:`);
console.log(`Cron Expression: ${cronExpression}`);
console.log(`Time: ${MORNING_HOUR}:00 every day`);
console.log(`Timezone: ${TIMEZONE}`);

// Validate cron
if (!cron.validate(cronExpression)) {
  console.error('❌ Invalid cron expression');
  process.exit(1);
}

console.log('✅ Cron expression is valid\n');

// Calculate next run
const now = new Date();
const year = now.getFullYear();
const month = now.getMonth();
const date = now.getDate();

// Create date for today at MORNING_HOUR
const todayRun = new Date(year, month, date, MORNING_HOUR, 0, 0, 0);

// Calculate next run time
let nextRun;
if (now < todayRun) {
  nextRun = todayRun;
} else {
  nextRun = new Date(todayRun);
  nextRun.setDate(nextRun.getDate() + 1);
}

console.log(`Current time: ${now.toLocaleString()}`);
console.log(`Next SMS run: ${nextRun.toLocaleString()}`);
console.log(`Hours until next run: ${Math.round((nextRun - now) / 3600000)}`);
console.log('\nTo trigger SMS manually, run:');
console.log('node -e "require(\'./services/smsScheduler\').triggerSMSNow()"\n');

process.exit(0);
