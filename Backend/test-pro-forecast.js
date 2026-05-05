/*
  Quick manual test (node Backend/test-pro-forecast.js)

  Required env:
    BASE_URL=http://localhost:4000
    TOKEN=<bearer token>

  Optional:
    DAYS=14
*/

const baseUrl = process.env.BASE_URL || "http://localhost:4000";
const token = process.env.TOKEN;

async function main() {
  if (!token) {
    console.error("Missing TOKEN env var");
    process.exit(1);
  }

  const days = process.env.DAYS || "14";

  const statusRes = await fetch(`${baseUrl}/api/pro/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const statusJson = await statusRes.json();
  console.log("/api/pro/status", statusRes.status, statusJson);

  // If not Pro, this next call should return 402 with code=PRO_REQUIRED

  const forecastRes = await fetch(
    `${baseUrl}/api/pro/personal-market-forecast?days=${encodeURIComponent(days)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const forecastText = await forecastRes.text();
  console.log("/api/pro/personal-market-forecast", forecastRes.status);
  console.log(forecastText.slice(0, 2000));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
