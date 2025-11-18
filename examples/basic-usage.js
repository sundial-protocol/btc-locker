const { BTCLocker, TimeUtils } = require("../src/index");

// Example: Basic timelock usage
async function basicTimelockExample() {
  console.log("=== Basic Timelock Example ===\n");

  // Initialize BTCLocker
  const locker = new BTCLocker();

  // Generate a key pair
  const keyPair = locker.generateKeyPair();
  console.log("Generated Key Pair:");
  console.log("Private Key:", keyPair.privateKey);
  console.log("Public Key:", keyPair.publicKey);
  console.log("Address:", keyPair.address);
  console.log("");

  // Create a timelock script (lock for 1 week from now)
  const locktime = TimeUtils.addDuration(TimeUtils.DURATIONS.WEEK);
  const script = locker.createTimelockScript(locktime, keyPair.publicKey);

  console.log("Timelock Script Info:");
  console.log("Script Address:", script.address);
  console.log("Locktime:", new Date(locktime * 1000).toISOString());
  console.log("Script Hash:", script.scriptHash);
  console.log("Redeem Script:", script.redeemScript);
  console.log("");

  // Check if timelock is expired (should be false since we just set it for future)
  const isExpired = locker.isTimelockExpired(locktime);
  console.log("Is timelock expired?", isExpired);
  console.log("");
}

// Example: Multisig timelock
async function multisigTimelockExample() {
  console.log("=== Multisig Timelock Example ===\n");

  const locker = new BTCLocker();

  // Generate three key pairs for 2-of-3 multisig
  const keyPair1 = locker.generateKeyPair();
  const keyPair2 = locker.generateKeyPair();
  const keyPair3 = locker.generateKeyPair();

  console.log("Generated 3 key pairs for 2-of-3 multisig");
  console.log("Key 1:", keyPair1.publicKey);
  console.log("Key 2:", keyPair2.publicKey);
  console.log("Key 3:", keyPair3.publicKey);
  console.log("");

  // Create 2-of-3 multisig timelock (lock for 1 month)
  const locktime = TimeUtils.addDuration(TimeUtils.DURATIONS.MONTH);
  const publicKeys = [
    keyPair1.publicKey,
    keyPair2.publicKey,
    keyPair3.publicKey,
  ];
  const multisigScript = locker.createMultisigTimelockScript(
    locktime,
    2,
    publicKeys
  );

  console.log("2-of-3 Multisig Timelock Script:");
  console.log("Script Address:", multisigScript.address);
  console.log("Locktime:", new Date(locktime * 1000).toISOString());
  console.log("Required Signatures:", multisigScript.m);
  console.log("Public Keys:", multisigScript.publicKeys.length);
  console.log("");
}

// Example: HODL script with emergency escape
async function hodlScriptExample() {
  console.log("=== HODL Script Example ===\n");

  const locker = new BTCLocker();

  // Generate owner and penalty key pairs
  const ownerKeyPair = locker.generateKeyPair();
  const penaltyKeyPair = locker.generateKeyPair();

  console.log("Owner Public Key:", ownerKeyPair.publicKey);
  console.log("Penalty Public Key:", penaltyKeyPair.publicKey);
  console.log("");

  // Create HODL script (lock for 1 year with emergency escape)
  const locktime = TimeUtils.addDuration(TimeUtils.DURATIONS.YEAR);
  const hodlScript = locker.createHodlScript(
    locktime,
    ownerKeyPair.publicKey,
    penaltyKeyPair.publicKey
  );

  console.log("HODL Script Info:");
  console.log("Script Address:", hodlScript.address);
  console.log("Locktime:", new Date(locktime * 1000).toISOString());
  console.log("Type:", hodlScript.type);
  console.log("");
}

// Example: Relative timelock
async function relativeTimelockExample() {
  console.log("=== Relative Timelock Example ===\n");

  const locker = new BTCLocker();
  const keyPair = locker.generateKeyPair();

  // Create relative timelock (144 blocks ≈ 1 day)
  const relativeScript = locker.createRelativeTimelockScript(
    144,
    keyPair.publicKey
  );

  console.log("Relative Timelock Script Info:");
  console.log("Script Address:", relativeScript.address);
  console.log("Sequence (blocks):", relativeScript.sequence);
  console.log(
    "Approximate time:",
    TimeUtils.blocksToSeconds(144) / 3600,
    "hours"
  );
  console.log("");
}

// Run all examples
async function runAllExamples() {
  try {
    await basicTimelockExample();
    await multisigTimelockExample();
    await hodlScriptExample();
    await relativeTimelockExample();

    console.log("All examples completed successfully!");
  } catch (error) {
    console.error("Error running examples:", error.message);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples();
}

module.exports = {
  basicTimelockExample,
  multisigTimelockExample,
  hodlScriptExample,
  relativeTimelockExample,
};
