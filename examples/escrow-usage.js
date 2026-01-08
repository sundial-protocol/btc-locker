/**
 * @fileoverview Example: Time-based escrow script usage
 * @description Demonstrates creating and using time-based escrow scripts where
 * one user can withdraw before a deadline and another can withdraw after
 */

import { BTCLocker } from "../src/locker/index.js";

/**
 * Example: Create and use a time-based escrow script
 * 
 * Scenario:
 * - Alice wants to send payment to Bob for services
 * - Alice can withdraw funds back if services aren't delivered by deadline
 * - Bob can withdraw funds after deadline if services are completed
 * - Deadline: January 15, 2026
 */
async function escrowExample() {
  try {
    console.log("🔒 Time-based Escrow Example");
    console.log("============================\n");

    // Initialize BTCLocker for testnet
    const locker = new BTCLocker("testnet");
    await locker.init();
    console.log("✅ BTCLocker initialized for testnet");

    // Generate key pairs for Alice and Bob
    const aliceKeyPair = await locker.generateKeyPair();
    const bobKeyPair = await locker.generateKeyPair();
    
    console.log("👩 Alice's address:", aliceKeyPair.address);
    console.log("👨 Bob's address:", bobKeyPair.address);

    // Set deadline: January 15, 2026 at noon UTC
    const deadline = Math.floor(new Date("2026-01-15T12:00:00Z").getTime() / 1000);
    console.log("⏰ Deadline:", new Date(deadline * 1000).toISOString());

    // Create escrow script
    // Alice can withdraw before deadline, Bob can withdraw after deadline
    const escrowScript = await locker.createEscrowScript(
      deadline,
      aliceKeyPair.publicKey, // beforePublicKey (Alice)
      bobKeyPair.publicKey    // afterPublicKey (Bob)
    );

    console.log("\n📄 Escrow Script Created:");
    console.log("Address:", escrowScript.address);
    console.log("Type:", escrowScript.type);
    console.log("Deadline timestamp:", escrowScript.deadline);
    console.log("Before-deadline key (Alice):", escrowScript.beforePublicKey);
    console.log("After-deadline key (Bob):", escrowScript.afterPublicKey);

    // Simulate funding the escrow (this would be done with real UTXOs)
    const mockUtxo = {
      txId: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      index: 0,
      amount: 100000 // 0.001 BTC in satoshis
    };

    console.log("\n💰 Simulated escrow funding:");
    console.log("UTXO:", `${mockUtxo.txId}:${mockUtxo.index}`);
    console.log("Amount:", mockUtxo.amount, "satoshis");

    // Example 1: Alice withdraws before deadline (service not delivered)
    console.log("\n🔄 Example 1: Alice withdraws before deadline");
    try {
      const currentTime = new Date("2026-01-10T10:00:00Z").getTime(); // Before deadline
      console.log("Current time:", new Date(currentTime).toISOString());
      
      const aliceWithdrawal = await locker.createEscrowSpendingTransaction(
        escrowScript,
        mockUtxo.txId,
        mockUtxo.index,
        mockUtxo.amount,
        aliceKeyPair.address, // Send back to Alice
        false, // spendAfterDeadline = false
        aliceKeyPair.privateKey,
        currentTime
      );

      console.log("✅ Alice's withdrawal transaction created");
      console.log("Transaction ID:", aliceWithdrawal.txId);
      console.log("Transaction hex length:", aliceWithdrawal.txHex.length);
    } catch (error) {
      console.log("❌ Alice's withdrawal failed:", error.message);
    }

    // Example 2: Bob tries to withdraw before deadline (should fail)
    console.log("\n🔄 Example 2: Bob tries to withdraw before deadline (should fail)");
    try {
      const currentTime = new Date("2026-01-10T10:00:00Z").getTime(); // Before deadline
      
      const bobEarlyWithdrawal = await locker.createEscrowSpendingTransaction(
        escrowScript,
        mockUtxo.txId,
        mockUtxo.index,
        mockUtxo.amount,
        bobKeyPair.address,
        true, // spendAfterDeadline = true
        bobKeyPair.privateKey,
        currentTime
      );

      console.log("❌ This should not succeed!");
    } catch (error) {
      console.log("✅ Correctly prevented: Bob cannot withdraw before deadline");
      console.log("Error:", error.message);
    }

    // Example 3: Bob withdraws after deadline (service delivered)
    console.log("\n🔄 Example 3: Bob withdraws after deadline");
    try {
      const currentTime = new Date("2026-01-20T10:00:00Z").getTime(); // After deadline
      console.log("Current time:", new Date(currentTime).toISOString());
      
      const bobWithdrawal = await locker.createEscrowSpendingTransaction(
        escrowScript,
        mockUtxo.txId,
        mockUtxo.index,
        mockUtxo.amount,
        bobKeyPair.address, // Send to Bob
        true, // spendAfterDeadline = true
        bobKeyPair.privateKey,
        currentTime
      );

      console.log("✅ Bob's withdrawal transaction created");
      console.log("Transaction ID:", bobWithdrawal.txId);
      console.log("Transaction hex length:", bobWithdrawal.txHex.length);
    } catch (error) {
      console.log("❌ Bob's withdrawal failed:", error.message);
    }

    // Example 4: Alice tries to withdraw after deadline with wrong key
    console.log("\n🔄 Example 4: Alice tries to withdraw after deadline (should fail)");
    try {
      const currentTime = new Date("2026-01-20T10:00:00Z").getTime(); // After deadline
      
      const aliceLateWithdrawal = await locker.createEscrowSpendingTransaction(
        escrowScript,
        mockUtxo.txId,
        mockUtxo.index,
        mockUtxo.amount,
        aliceKeyPair.address,
        true, // spendAfterDeadline = true (but using Alice's key)
        aliceKeyPair.privateKey,
        currentTime
      );

      console.log("❌ This should not succeed!");
    } catch (error) {
      console.log("✅ Correctly prevented: Alice cannot use after-deadline path");
      console.log("Error:", error.message);
    }

    console.log("\n🎉 Escrow example completed successfully!");
    
  } catch (error) {
    console.error("❌ Example failed:", error);
  }
}

/**
 * Real-world usage scenario
 */
async function realWorldScenario() {
  console.log("\n🌍 Real-world Scenario: Freelance Service Escrow");
  console.log("================================================\n");
  
  console.log("Scenario:");
  console.log("- Client (Alice) hires freelancer (Bob) for $1000 worth of work");
  console.log("- Work deadline: January 31, 2026");
  console.log("- Alice can get refund if work not delivered by deadline");
  console.log("- Bob can claim payment after deadline (assuming work completed)");
  
  const locker = new BTCLocker("testnet");
  await locker.init();
  
  const client = await locker.generateKeyPair();
  const freelancer = await locker.generateKeyPair();
  
  // Set deadline: January 31, 2026 at midnight UTC
  const workDeadline = Math.floor(new Date("2026-01-31T23:59:59Z").getTime() / 1000);
  
  const escrow = await locker.createEscrowScript(
    workDeadline,
    client.publicKey,     // Client can withdraw before deadline
    freelancer.publicKey  // Freelancer can withdraw after deadline
  );
  
  console.log("💼 Escrow Contract Created:");
  console.log("Address:", escrow.address);
  console.log("Deadline:", new Date(workDeadline * 1000).toISOString());
  console.log("Client can withdraw until:", new Date(workDeadline * 1000).toISOString());
  console.log("Freelancer can withdraw after:", new Date(workDeadline * 1000).toISOString());
  
  console.log("\n📋 Instructions:");
  console.log("1. Client sends payment to escrow address:", escrow.address);
  console.log("2. If work not delivered by deadline, client can withdraw using their private key");
  console.log("3. After deadline, freelancer can claim payment using their private key");
}

// Run examples
if (import.meta.url === `file://${process.argv[1]}`) {
  escrowExample()
    .then(() => realWorldScenario())
    .catch(console.error);
}