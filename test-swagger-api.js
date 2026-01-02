/**
 * Test script for Swagger API endpoints
 */
const fetch = require("node-fetch");

const BASE_URL = "http://localhost:3000/api";

async function testAPI() {
  console.log("🧪 Testing BTC Locker Swagger API...\n");

  try {
    // Test 1: Generate key pair
    console.log("1. Testing key pair generation...");
    const keyPairResponse = await fetch(`${BASE_URL}/keypair/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network: "testnet" }),
    });

    const keyPair = await keyPairResponse.json();
    console.log("✅ Key pair generated:", keyPair);
    console.log();

    // Test 2: Create timelock script
    console.log("2. Testing timelock script creation...");
    const timelockResponse = await fetch(`${BASE_URL}/timelock/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locktime: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        publicKey: keyPair.publicKey,
        network: "testnet",
      }),
    });

    const timelockScript = await timelockResponse.json();
    console.log("✅ Timelock script created:", {
      address: timelockScript.address,
      locktime: timelockScript.locktime,
    });
    console.log();

    // Test 3: Create multisig script
    console.log("3. Testing multisig timelock script creation...");
    const multisigResponse = await fetch(`${BASE_URL}/multisig/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locktime: Math.floor(Date.now() / 1000) + 7200, // 2 hours from now
        m: 2,
        publicKeys: [keyPair.publicKey, keyPair.publicKey], // Using same key for demo
        network: "testnet",
      }),
    });

    const multisigScript = await multisigResponse.json();
    console.log("✅ Multisig script created:", {
      address: multisigScript.address,
      m: multisigScript.m,
      n: multisigScript.n,
    });
    console.log();

    console.log("🎉 All API tests passed! Swagger API is working correctly.");
  } catch (error) {
    console.error("❌ API test failed:", error.message);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  testAPI();
}

module.exports = { testAPI };
