#!/usr/bin/env node

const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static("."));

// Serve the built bundle
app.use("/dist", express.static("dist"));

// CORS for browser testing
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  next();
});

// Serve the main demo page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "demo.html"));
});

// Serve the bundle file
app.get("/btc-locker.js", (req, res) => {
  const bundlePath = path.join(__dirname, "dist", "btc-locker.bundle.js");
  if (fs.existsSync(bundlePath)) {
    res.sendFile(bundlePath);
  } else {
    res
      .status(404)
      .json({ error: "Bundle not found. Run npm run build first." });
  }
});

// Simple API endpoint to get bundle status
app.get("/api/bundle-info", (req, res) => {
  const bundlePath = path.join(__dirname, "dist", "btc-locker.bundle.js");
  const exists = fs.existsSync(bundlePath);

  let stats = null;
  if (exists) {
    try {
      stats = fs.statSync(bundlePath);
    } catch (err) {
      // Ignore stat errors
    }
  }

  res.json({
    success: true,
    data: {
      bundleExists: exists,
      bundlePath: "/dist/btc-locker.bundle.js",
      bundleSize: stats ? stats.size : null,
      lastModified: stats ? stats.mtime : null,
    },
  });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: require("../package.json").version,
  });
});

// Serve example files
app.get("/examples/:filename", (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(__dirname, "examples", filename);

  if (fs.existsSync(filepath)) {
    res.sendFile(filepath);
  } else {
    res.status(404).json({ error: "Example file not found" });
  }
});

// Serve CLI documentation
app.get("/cli", (req, res) => {
  const cliMdPath = path.join(__dirname, "CLI.md");

  if (fs.existsSync(cliMdPath)) {
    const content = fs.readFileSync(cliMdPath, "utf8");
    res.set("Content-Type", "text/plain");
    res.send(content);
  } else {
    res.status(404).json({ error: "CLI documentation not found" });
  }
});

// Error handler
app.use((error, req, res, next) => {
  console.error("Server error:", error);
  res.status(500).json({
    error: "Internal server error",
    message: error.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.path,
  });
});

// Start server
app.listen(port, () => {
  console.log(`Demo Server running on http://localhost:${port}`);
});

module.exports = app;
