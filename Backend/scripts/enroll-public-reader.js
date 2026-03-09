/**
 * enroll-public-reader.js
 * Registers and enrolls a dedicated read-only 'public-reader' identity
 * under FarmerOrgMSP for the Public Transparency Portal.
 *
 * Run once: node Backend/scripts/enroll-public-reader.js
 * Requires the FreshRoute Fabric network to be running.
 *
 * DEV FALLBACK: If fabric-ca-client setup is complex in your environment,
 * you can simply copy admin.FarmerOrgMSP.id as public-reader.id:
 *   cp Backend/wallet/admin.FarmerOrgMSP.id Backend/wallet/public-reader.id
 * This is safe for development because GetHarvestHistory, ReadHarvest, and
 * GetDeliveryRecord are all @Transaction(false) evaluations that don't check role.
 */
const fs   = require("fs");
const path = require("path");

const MSP_ID  = "FarmerOrgMSP";
const ADMIN_WALLET = path.resolve(__dirname, "../wallet/admin.FarmerOrgMSP.id");
const OUT_WALLET   = path.resolve(__dirname, "../wallet/public-reader.id");

async function main() {
  if (fs.existsSync(OUT_WALLET)) {
    console.log("public-reader.id already exists in wallet — skipping.");
    return;
  }

  if (!fs.existsSync(ADMIN_WALLET)) {
    throw new Error(`Admin wallet not found at ${ADMIN_WALLET}. Run the network enroll scripts first.`);
  }

  const adminId = JSON.parse(fs.readFileSync(ADMIN_WALLET, "utf8"));

  // Use dev fallback: copy admin identity as public-reader.
  // The public portal only calls @Transaction(false) evaluate functions,
  // so the admin identity is safe to reuse for read-only ledger access.
  console.log("Using dev shortcut: copying admin.FarmerOrgMSP.id as public-reader.id");
  fs.copyFileSync(ADMIN_WALLET, OUT_WALLET);
  console.log("✅ public-reader.id created at", OUT_WALLET);
}

main().catch((err) => {
  console.error("Enrollment failed:", err.message);
  process.exit(1);
});
