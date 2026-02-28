require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

(async () => {
  try {
    const messages = await client.messages.list({ limit: 5 });
    console.log('\n📋 Recent Twilio Messages:\n');
    messages.forEach((msg, i) => {
      console.log(`${i+1}. To: ${msg.to}`);
      console.log(`   Status: ${msg.status}`);
      console.log(`   SID: ${msg.sid.substring(0, 10)}...`);
      if (msg.errorCode) {
        console.log(`   ❌ Error Code: ${msg.errorCode}`);
        console.log(`   Error Message: ${msg.errorMessage}`);
      }
      console.log(`   Sent: ${msg.dateSent}\n`);
    });
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
  process.exit(0);
})();
