#!/usr/bin/env node

/**
 * Example: Distribute Yield to Timelock Script
 *
 * This example shows how to use the BTCLocker library to distribute
 * yield or earnings back to a timelock script address.
 */

const { BTCLocker } = require("../src/index");
const bitcoin = require("bitcoinjs-lib");
const BitcoinAPI = require("../src/bitcoin-api");

async function distributeYieldExample() {
  // Create BTCLocker instance for testnet
  const locker = new BTCLocker(bitcoin.networks.testnet);
  const api = new BitcoinAPI("testnet");

  // Example parameters (replace with your actual values)
  const yieldSourcePrivateKey = "your_private_key_here"; // Private key with yield to distribute
  const timelockAddress = "2N3x3iMrEYYTMM5YMjzM34jXhWrRLRCFU1E"; // Target timelock script
  const distributionAmount = 10000; // 10,000 satoshis
  const memo = "Q1 2026 Yield Distribution";

  try {
    // 1. Generate address from private key
    const keyPair = locker.generateKeyPairFromPrivateKey(yieldSourcePrivateKey);
    const sourceAddress = keyPair.address;

    console.log(`📊 Checking UTXOs for yield source: ${sourceAddress}`);

    // 2. Get UTXOs for the source address
    const utxos = await api.getAddressUtxos(sourceAddress);
    const confirmedUtxos = utxos.filter((u) => u.status.confirmed);

    if (confirmedUtxos.length === 0) {
      throw new Error("No confirmed UTXOs found at source address");
    }

    // 3. Prepare inputs for distribution
    const txInputs = confirmedUtxos.map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
    }));

    console.log(
      `💰 Found ${
        confirmedUtxos.length
      } UTXOs with total value: ${confirmedUtxos.reduce(
        (sum, u) => sum + u.value,
        0
      )} satoshis`
    );

    // 4. Create yield distribution transaction
    const distributionParams = {
      inputs: txInputs,
      timelockAddress: timelockAddress,
      amount: distributionAmount,
      privateKey: yieldSourcePrivateKey,
      memo: memo,
    };

    const result = locker.distributeYield(distributionParams);

    console.log("🎯 Yield Distribution Transaction Created:");
    console.log("Transaction ID:", result.txid);
    console.log("Transaction Size:", result.size, "bytes");
    console.log("Fee:", result.fee, "satoshis");
    console.log("Memo:", result.memo);
    console.log("Distribution Amount:", result.distribution.amount, "satoshis");
    console.log("Destination:", result.distribution.destination);
    console.log("Change Amount:", result.distribution.change, "satoshis");

    // 5. Optional: Broadcast the transaction
    const shouldBroadcast = false; // Set to true to actually broadcast

    if (shouldBroadcast) {
      console.log("📡 Broadcasting transaction...");
      const broadcastResult = await api.broadcastTransaction(result.hex);
      console.log("✅ Transaction broadcasted successfully!");
      console.log(
        "Explorer:",
        `https://mempool.space/testnet/tx/${result.txid}`
      );
    } else {
      console.log("🔍 Dry run completed. Transaction hex:");
      console.log(result.hex);
      console.log("💡 Set shouldBroadcast = true to broadcast the transaction");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Example usage with different distribution strategies
function demonstrateDistributionStrategies() {
  console.log("\n📋 Yield Distribution Strategies:");

  console.log("\n1. Fixed Amount Distribution:");
  console.log("   - Distribute a fixed amount (e.g., 10,000 sats) regularly");
  console.log("   - Good for consistent yield payments");

  console.log("\n2. Percentage-based Distribution:");
  console.log("   - Distribute a percentage of total yield earned");
  console.log("   - Calculate: totalYield * distributionPercentage");

  console.log("\n3. Threshold Distribution:");
  console.log("   - Only distribute when yield exceeds a threshold");
  console.log("   - Helps minimize transaction fees for small amounts");

  console.log("\n4. Batch Distribution:");
  console.log("   - Accumulate yield and distribute in larger batches");
  console.log("   - More efficient for gas/fee optimization");
}

// Run the example
if (require.main === module) {
  console.log("🔒 BTC Locker - Yield Distribution Example\n");

  demonstrateDistributionStrategies();

  console.log("\n" + "=".repeat(60));
  console.log("To run the actual distribution, update the parameters above");
  console.log("and set shouldBroadcast = true");
  console.log("=".repeat(60));

  // Uncomment to run actual distribution:
  // distributeYieldExample();
}

module.exports = { distributeYieldExample };
