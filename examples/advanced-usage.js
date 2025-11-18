const { BTCLocker, TimeUtils, TransactionUtils } = require("../src/index");

/**
 * Advanced example: Create and spend from a timelock script
 * This example demonstrates the complete flow of creating a timelock,
 * funding it, and then spending from it after the timelock expires.
 */
async function advancedTimelockFlow() {
  console.log("=== Advanced Timelock Flow Example ===\n");

  const locker = new BTCLocker();

  // Step 1: Generate key pair and create timelock script
  const keyPair = locker.generateKeyPair();
  console.log("1. Generated key pair");
  console.log("   Address:", keyPair.address);
  console.log("");

  // Create a timelock for 10 minutes from now (for demonstration)
  const locktime = TimeUtils.addDuration(10 * TimeUtils.DURATIONS.MINUTE);
  const timelockScript = locker.createTimelockScript(
    locktime,
    keyPair.publicKey
  );

  console.log("2. Created timelock script");
  console.log("   Script Address:", timelockScript.address);
  console.log("   Locktime:", new Date(locktime * 1000).toISOString());
  console.log(
    "   (Funds sent to this address will be locked until the above time)"
  );
  console.log("");

  // Step 2: Simulate funding the timelock address
  // In practice, you would send Bitcoin to timelockScript.address
  console.log("3. Funding simulation");
  console.log(
    "   To fund this timelock, send Bitcoin to:",
    timelockScript.address
  );
  console.log(
    "   The funds will be locked until:",
    new Date(locktime * 1000).toISOString()
  );
  console.log("");

  // Step 3: Check timelock status
  const isCurrentlyExpired = locker.isTimelockExpired(locktime);
  console.log("4. Timelock status check");
  console.log("   Is currently expired?", isCurrentlyExpired);
  console.log(
    "   Time until expiry:",
    Math.max(0, locktime - Math.floor(Date.now() / 1000)),
    "seconds"
  );
  console.log("");

  // Step 4: Demonstrate spending transaction creation (theoretical)
  console.log("5. Spending transaction preparation");

  // Example UTXO (this would come from your wallet or blockchain API)
  const exampleUTXO = {
    txid: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    vout: 0,
    value: 100000, // 0.001 BTC in satoshis
    hex: "0100000001...", // Full transaction hex would be here
  };

  const destinationAddress = keyPair.address; // Send back to original address
  const estimatedFee = TransactionUtils.estimateFee(1, 1, 10); // 1 input, 1 output, 10 sat/vB

  console.log(
    "   Example UTXO value:",
    TransactionUtils.satoshisToBTC(exampleUTXO.value),
    "BTC"
  );
  console.log("   Estimated fee:", estimatedFee, "satoshis");
  console.log(
    "   Net amount after fee:",
    TransactionUtils.satoshisToBTC(exampleUTXO.value - estimatedFee),
    "BTC"
  );
  console.log("");

  console.log("6. Important notes:");
  console.log(
    "   - The timelock script can only be spent after the locktime expires"
  );
  console.log(
    "   - You need the private key corresponding to the public key in the script"
  );
  console.log(
    "   - The transaction must have its locktime set to the script locktime or later"
  );
  console.log("   - Make sure to account for network fees when spending");
  console.log("");
}

/**
 * Multi-signature timelock with spending example
 */
async function multisigSpendingExample() {
  console.log("=== Multi-signature Timelock Spending Example ===\n");

  const locker = new BTCLocker();

  // Generate multiple key pairs
  const keyPairs = [];
  for (let i = 0; i < 3; i++) {
    keyPairs.push(locker.generateKeyPair());
  }

  console.log("1. Generated 3 key pairs for multisig");
  keyPairs.forEach((kp, i) => {
    console.log(`   Key ${i + 1}:`, kp.address);
  });
  console.log("");

  // Create 2-of-3 multisig timelock
  const locktime = TimeUtils.addDuration(TimeUtils.DURATIONS.DAY);
  const publicKeys = keyPairs.map((kp) => kp.publicKey);
  const multisigScript = locker.createMultisigTimelockScript(
    locktime,
    2,
    publicKeys
  );

  console.log("2. Created 2-of-3 multisig timelock");
  console.log("   Script Address:", multisigScript.address);
  console.log("   Required signatures: 2 out of 3");
  console.log("   Locktime:", new Date(locktime * 1000).toISOString());
  console.log("");

  console.log("3. Spending requirements:");
  console.log(
    "   - Wait until after:",
    new Date(locktime * 1000).toISOString()
  );
  console.log("   - Provide signatures from any 2 of the 3 private keys");
  console.log("   - Include the redeem script in the transaction");
  console.log("");
}

/**
 * Emergency escape HODL example
 */
async function emergencyEscapeExample() {
  console.log("=== Emergency Escape HODL Example ===\n");

  const locker = new BTCLocker();

  const ownerKeyPair = locker.generateKeyPair();
  const emergencyKeyPair = locker.generateKeyPair();

  console.log("1. Generated key pairs");
  console.log("   Owner:", ownerKeyPair.address);
  console.log("   Emergency contact:", emergencyKeyPair.address);
  console.log("");

  // Create HODL script with 1-year lock and emergency escape
  const locktime = TimeUtils.addDuration(TimeUtils.DURATIONS.YEAR);
  const hodlScript = locker.createHodlScript(
    locktime,
    ownerKeyPair.publicKey,
    emergencyKeyPair.publicKey
  );

  console.log("2. Created HODL script with emergency escape");
  console.log("   Script Address:", hodlScript.address);
  console.log(
    "   Normal unlock after:",
    new Date(locktime * 1000).toISOString()
  );
  console.log("");

  console.log("3. Spending options:");
  console.log(
    "   Option A (Normal): Wait until locktime and spend with owner key only"
  );
  console.log(
    "   Option B (Emergency): Spend anytime with both owner + emergency signatures"
  );
  console.log(
    "   This provides a safety mechanism while encouraging long-term holding"
  );
  console.log("");
}

// Run all advanced examples
async function runAdvancedExamples() {
  try {
    await advancedTimelockFlow();
    await multisigSpendingExample();
    await emergencyEscapeExample();

    console.log("All advanced examples completed!");
    console.log("\nNext steps:");
    console.log("1. Install dependencies: npm install");
    console.log("2. Run tests: npm test");
    console.log("3. Build for browser: npm run build");
    console.log("4. Check the generated documentation: npm run docs");
  } catch (error) {
    console.error("Error running advanced examples:", error.message);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runAdvancedExamples();
}

module.exports = {
  advancedTimelockFlow,
  multisigSpendingExample,
  emergencyEscapeExample,
};
