#!/usr/bin/env node

/**
 * Demo Hosting Script for BTC Locker
 *
 * This script sets up and hosts a comprehensive demo of the BTC Locker library,
 * using the browser bundle for all Bitcoin operations.
 */

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("🚀 Starting BTC Locker Demo Setup...\n");

// Check if node_modules exists and has express
const hasExpress = () => {
  try {
    require.resolve("express");
    return true;
  } catch (e) {
    return false;
  }
};

// Install dependencies if needed
if (!hasExpress()) {
  console.log("📦 Installing demo dependencies...");
  try {
    execSync("npm install express", { stdio: "inherit" });
    console.log("✅ Dependencies installed successfully!\n");
  } catch (error) {
    console.error("❌ Failed to install dependencies:", error.message);
    process.exit(1);
  }
}

// Build the project to ensure we have the latest bundle
const bundlePath = path.join(__dirname, "dist", "btc-locker.bundle.js");
if (!fs.existsSync(bundlePath)) {
  console.log("🔧 Building browser bundle...");
  try {
    execSync("npm run build", { stdio: "inherit" });
    console.log("✅ Browser bundle built successfully!\n");
  } catch (error) {
    console.error("❌ Failed to build bundle:", error.message);
    process.exit(1);
  }
} else {
  console.log("✅ Browser bundle already exists\n");
}

// Start the demo server
console.log("🌐 Starting demo server...\n");

const server = spawn("node", ["demo-server.js"], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "demo" },
});

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down demo server...");
  server.kill("SIGINT");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Shutting down demo server...");
  server.kill("SIGTERM");
  process.exit(0);
});

server.on("error", (error) => {
  console.error("❌ Failed to start demo server:", error.message);
  process.exit(1);
});

server.on("exit", (code) => {
  if (code !== 0) {
    console.error(`❌ Demo server exited with code ${code}`);
    process.exit(code);
  }
});
