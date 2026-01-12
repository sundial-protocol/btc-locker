/**
 * Dawn Protocol Staking Example - Updated Version
 * 
 * This example demonstrates how to create Dawn Protocol staking transactions
 * that send funds to two configurable destinations in a single transaction:
 * 1. A configurable amount to an escrow script
 * 2. A configurable amount to a configurable timelock script
 */

import { BTCLocker } from "../src/index.js";

/**
 * Example: Create Dawn Protocol staking transaction with configurable timelock script
 */
async function dawnStakingExample() {
  try {
    console.log("=== Dawn Protocol Staking Example (v0) ===\n");

    // Initialize BTCLocker for testnet
    const locker = new BTCLocker("testnet");
    await locker.init();
    console.log("✓ BTCLocker initialized\n");

    // Generate key pairs for different participants
    const userKeyPair = await locker.generateKeyPair();
    const escrowKeyPair1 = await locker.generateKeyPair(); 
    const escrowKeyPair2 = await locker.generateKeyPair();
    const timelockKeyPair = await locker.generateKeyPair();
    
    console.log("Generated Key Pairs:");
    console.log("User Address:", userKeyPair.address);
    console.log("Escrow Key 1:", escrowKeyPair1.address);
    console.log("Escrow Key 2:", escrowKeyPair2.address);
    console.log("Timelock Key:", timelockKeyPair.address);
    console.log();

    // Create escrow script for Dawn Protocol
    const escrowDeadline = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days
    const escrowScript = await locker.createEscrowScript(
      escrowDeadline,
      escrowKeyPair1.publicKey,
      escrowKeyPair2.publicKey
    );
    
    console.log("Escrow Script Created:");
    console.log("Address:", escrowScript.address);
    console.log("Type:", escrowScript.type);
    console.log("Deadline:", new Date(escrowDeadline * 1000).toISOString());
    console.log();

    // Create configurable timelock script
    const timelockDeadline = Math.floor(Date.now() / 1000) + (60 * 24 * 60 * 60); // 60 days
    const timelockScript = await locker.createTimelockScript(
      timelockDeadline,
      timelockKeyPair.publicKey
    );
    
    console.log("Timelock Script Created:");
    console.log("Address:", timelockScript.address);
    console.log("Type:", timelockScript.type);
    console.log("Locktime:", new Date(timelockDeadline * 1000).toISOString());
    console.log();

    // Mock UTXO inputs (in real scenario, these would come from the user's wallet)
    const mockInputs = [
      {
        txid: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        vout: 0,
        value: 800000 // 0.008 BTC in satoshis
      },
      {
        txid: "fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321", 
        vout: 1,
        value: 400000 // 0.004 BTC in satoshis
      }
    ];

    const totalInput = mockInputs.reduce((sum, input) => sum + input.value, 0);
    console.log(`Total Input Value: ${totalInput} sats (${(totalInput / 100000000).toFixed(8)} BTC)\n`);

    // Define desired amounts for both outputs
    const desiredEscrowAmount = 300000; // 0.003 BTC to escrow
    const desiredTimelockAmount = 500000; // 0.005 BTC to timelock

    // Calculate feasibility
    const calculation = await locker.calculateDawnStakingAmounts({
      inputs: mockInputs,
      desiredEscrowAmount,
      desiredTimelockAmount,
      includeChange: true,
      feeRate: 15
    });

    console.log("Amount Calculation:");
    console.log("Total Input Value:", calculation.totalInputValue, "sats");
    console.log("Desired Escrow:", desiredEscrowAmount, "sats");
    console.log("Desired Timelock:", desiredTimelockAmount, "sats");
    console.log("Estimated Fee:", calculation.estimatedFee, "sats");
    console.log("Total Required:", calculation.totalRequired, "sats");
    console.log("Change Amount:", calculation.changeAmount, "sats");
    console.log("Transaction Feasible:", calculation.feasible);
    if (calculation.recommendation) {
      console.log("Recommendation:", calculation.recommendation);
    }
    console.log();

    if (!calculation.feasible) {
      console.log("❌ Transaction not feasible with current parameters");
      return;
    }

    // Create basic Dawn staking transaction with addresses
    console.log("Creating Dawn Staking Transaction with Addresses...");
    const changeKeyPair = await locker.generateKeyPair();
    
    const stakingTx = await locker.createDawnStakingTransaction({
      inputs: mockInputs,
      escrowAddress: escrowScript.address,
      escrowAmount: desiredEscrowAmount,
      timelockAddress: timelockScript.address,
      timelockAmount: desiredTimelockAmount,
      changeAddress: changeKeyPair.address,
      privateKey: userKeyPair.privateKey,
      feeRate: 15
    });

    console.log("Dawn Staking Transaction Created:");
    console.log("Transaction ID:", stakingTx.txid);
    console.log("Transaction Size:", stakingTx.size, "bytes");
    console.log("Transaction Fee:", stakingTx.fee, "sats");
    console.log("Escrow Amount:", stakingTx.outputs.escrowAmount, "sats");
    console.log("Timelock Amount:", stakingTx.outputs.timelockAmount, "sats");
    console.log("Change Amount:", stakingTx.outputs.changeAmount || 0, "sats");
    console.log("Transaction Hex:", stakingTx.hex.substring(0, 100) + "...");
    console.log();

    // Create Dawn staking transaction using script objects
    console.log("Creating Dawn Staking Transaction with Script Objects...");
    
    const stakingTxWithScript = await locker.createDawnStakingTransactionWithScript({
      inputs: mockInputs,
      escrowAddress: escrowScript.address,
      escrowAmount: desiredEscrowAmount,
      timelockScript: timelockScript, // Pass the full script object
      timelockAmount: desiredTimelockAmount,
      changeAddress: changeKeyPair.address,
      privateKey: userKeyPair.privateKey,
      feeRate: 15
    });

    console.log("Dawn Staking Transaction with Script Objects:");
    console.log("Transaction ID:", stakingTxWithScript.txid);
    console.log("Transaction Size:", stakingTxWithScript.size, "bytes");
    console.log("Transaction Fee:", stakingTxWithScript.fee, "sats");
    console.log("Escrow Amount:", stakingTxWithScript.outputs.escrowAmount, "sats");
    console.log("Timelock Amount:", stakingTxWithScript.outputs.timelockAmount, "sats");
    console.log("Change Amount:", stakingTxWithScript.outputs.changeAmount || 0, "sats");
    console.log("Timelock Script Info:");
    console.log("  Address:", stakingTxWithScript.timelockScript.address);
    console.log("  Type:", stakingTxWithScript.timelockScript.type);
    console.log("  Locktime:", stakingTxWithScript.timelockScript.locktime);
    console.log();

    // Demonstrate different timelock script types
    console.log("=== Different Timelock Script Types ===\n");
    
    // Multisig timelock script
    const multisigKeyPair1 = await locker.generateKeyPair();
    const multisigKeyPair2 = await locker.generateKeyPair();
    const multisigKeyPair3 = await locker.generateKeyPair();
    
    const multisigTimelockScript = await locker.createMultisigTimelockScript(
      timelockDeadline,
      2, // 2-of-3 multisig
      [multisigKeyPair1.publicKey, multisigKeyPair2.publicKey, multisigKeyPair3.publicKey]
    );
    
    console.log("Multisig Timelock Script:");
    console.log("Address:", multisigTimelockScript.address);
    console.log("Type:", multisigTimelockScript.type);
    console.log("Required Signatures:", 2);
    console.log("Total Keys:", 3);
    console.log();

    // HODL script (with emergency escape)
    const hodlOwnerKeyPair = await locker.generateKeyPair();
    const hodlEmergencyKeyPair = await locker.generateKeyPair();
    
    const hodlScript = await locker.createHodlScript(
      timelockDeadline,
      hodlOwnerKeyPair.publicKey,
      hodlEmergencyKeyPair.publicKey
    );
    
    console.log("HODL Script:");
    console.log("Address:", hodlScript.address);
    console.log("Type:", hodlScript.type);
    console.log("Owner Key:", hodlOwnerKeyPair.address);
    console.log("Emergency Key:", hodlEmergencyKeyPair.address);
    console.log();

    // Dawn staking with multisig timelock
    console.log("Creating Dawn Staking with Multisig Timelock...");
    
    const multisigStakingTx = await locker.createDawnStakingTransactionWithScript({
      inputs: mockInputs,
      escrowAddress: escrowScript.address,
      escrowAmount: 200000,
      timelockScript: multisigTimelockScript,
      timelockAmount: 600000,
      changeAddress: changeKeyPair.address,
      privateKey: userKeyPair.privateKey,
      feeRate: 15
    });

    console.log("Multisig Dawn Staking Transaction:");
    console.log("Transaction ID:", multisigStakingTx.txid);
    console.log("Escrow Amount:", multisigStakingTx.outputs.escrowAmount, "sats");
    console.log("Multisig Timelock Amount:", multisigStakingTx.outputs.timelockAmount, "sats");
    console.log("Change Amount:", multisigStakingTx.outputs.changeAmount || 0, "sats");
    console.log();

    // Demonstrate edge cases
    console.log("=== Edge Cases ===\n");
    
    // Too high amounts
    try {
      await locker.calculateDawnStakingAmounts({
        inputs: mockInputs,
        desiredEscrowAmount: 600000, // Too high
        desiredTimelockAmount: 700000, // Too high
        includeChange: false
      });
    } catch (error) {
      console.log("High amounts scenario:", error.message);
    }

    // Below dust threshold
    try {
      await locker.calculateDawnStakingAmounts({
        inputs: [{ txid: "abc", vout: 0, value: 5000 }],
        desiredEscrowAmount: 100, // Below dust
        desiredTimelockAmount: 200, // Below dust
        includeChange: false
      });
    } catch (error) {
      console.log("Dust threshold scenario:", error.message);
    }

    console.log();
    console.log("✓ Dawn Protocol staking example completed successfully!");
    console.log("✓ Supports configurable amounts to both escrow and timelock scripts");
    console.log("✓ Timelock script type is configurable (simple, multisig, HODL, etc.)");

  } catch (error) {
    console.error("❌ Error in Dawn staking example:", error.message);
    throw error;
  }
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  dawnStakingExample().catch(console.error);
}

export { dawnStakingExample };