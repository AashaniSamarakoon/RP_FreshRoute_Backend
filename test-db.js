require("dotenv").config();
const postgres = require("postgres");

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

(async () => {
  try {
    console.log("Connecting to DB via pooler...");
    const rows = await sql`SELECT NOW()`;
    console.log("Success:", rows);
  } catch (err) {
    console.error("DB connection error:", err);
  } finally {
    await sql.end({ timeout: 5 });
  }
})();
