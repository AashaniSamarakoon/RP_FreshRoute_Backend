require("dotenv").config();
const express = require("express");

const app = express();
const port = process.env.PORT || 4000;

app.get("/", (req, res) => {
  res.json({ message: "FreshRoute backend running" });
});

app.get("/health", (req, res) => {
  res.json({ status: "Healthy", message: "FreshRoute backend running" });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "FreshRoute backend running",
    mock: true,
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log("FreshRoute backend running");
});
