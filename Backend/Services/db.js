// db.js (CommonJS)
require("dotenv").config();
const postgres = require("postgres");

const connectionString = process.env.DATABASE_URL;

console.log("DATABASE_URL =", connectionString); // TEMP: make sure it's the pooler URL

const sql = postgres(connectionString, {
  ssl: "require", // Supabase needs SSL
});

module.exports = sql;
