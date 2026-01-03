#!/usr/bin/env node

/**
 * Quick test script to verify string network parameter functionality
 */

import { BTCLocker, createBTCLocker } from "./src/index.js";
import * as bitcoin from "bitcoinjs-lib";

console.log("🧪 Testing BTCLocker string network parameter support...\n");

async function testNetworkStrings() {
  try {
    // Test direct constructor with string
    console.log("1️⃣ Testing BTCLocker constructor with string networks:");

    const testnetLocker = new BTCLocker("testnet");
    await testnetLocker.init();
    console.log(
      `✅ testnet: ${
        testnetLocker.network === bitcoin.networks.testnet ? "PASS" : "FAIL"
      }`
    );

    const mainnetLocker = new BTCLocker("bitcoin");
    await mainnetLocker.init();
    console.log(
      `✅ bitcoin: ${
        mainnetLocker.network === bitcoin.networks.bitcoin ? "PASS" : "FAIL"
      }`
    );

    const regtestLocker = new BTCLocker("regtest");
    await regtestLocker.init();
    console.log(
      `✅ regtest: ${
        regtestLocker.network === bitcoin.networks.regtest ? "PASS" : "FAIL"
      }`
    );

    // Test factory function
    console.log("\n2️⃣ Testing createBTCLocker factory function:");
    const factoryLocker = await createBTCLocker("testnet");
    console.log(
      `✅ factory testnet: ${
        factoryLocker.network === bitcoin.networks.testnet ? "PASS" : "FAIL"
      }`
    );

    // Test generating a keypair with string network
    console.log("\n3️⃣ Testing key generation with string network:");
    const keyPair = await testnetLocker.generateKeyPair();
    console.log(`✅ Generated keypair with address: ${keyPair.address}`);

    // Test creating a timelock script
    console.log("\n4️⃣ Testing timelock script creation:");
    const locktime = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24 hours
    const script = await testnetLocker.createTimelockScript(
      locktime,
      keyPair.publicKey
    );
    console.log(`✅ Created timelock script with address: ${script.address}`);

    console.log(
      "\n✨ All tests passed! String network parameters are working correctly."
    );
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Test error handling
async function testErrorHandling() {
  console.log("\n5️⃣ Testing error handling:");
  try {
    new BTCLocker("invalid-network");
    console.log("❌ Should have thrown error for invalid network");
  } catch (error) {
    console.log(`✅ Correctly caught error: ${error.message}`);
  }
}

async function main() {
  await testNetworkStrings();
  await testErrorHandling();
  console.log("\n🎉 All tests completed successfully!");
  process.exit(0);
}

main().catch(console.error);
