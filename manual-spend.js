#!/usr/bin/env node

/**
 * Manual timelock spending transaction
 * This bypasses PSBT limitations for P2SH timelock scripts
 */

const bitcoin = require("bitcoinjs-lib");
const { ECPairFactory } = require("ecpair");
const ecc = require("tiny-secp256k1");
const BitcoinAPI = require("./src/bitcoin-api");

const ECPair = ECPairFactory(ecc);

async function spendTimelock() {
  const network = bitcoin.networks.testnet;
  const api = new BitcoinAPI("testnet");

  // Your parameters
  const scriptAddress = "2MugawCqeWdGVc1FsGZMCGVBxMcF8R448nD";
  const redeemScriptHex =
    "049ba43c69b1752103dc3f55cad6c4c014bfa8bcb77a6e0cec76ff251c2c584163667abb9d75112151ac";
  const destinationAddress = "tb1qmjqmhagnz06y0g2v4zuqq75nry96sepemg4zjq";
  const privateKeyHex =
    "c449d4f3efe71e7068d0dbefaf5a0e3f047a4738abe2f573b4a1f9c7b2942433";
  const locktime = 1765581979;

  try {
    // Get UTXOs
    console.log("Getting UTXOs...");
    const utxos = await api.getAddressUtxos(scriptAddress);
    const confirmedUtxos = utxos.filter((u) => u.status.confirmed);

    if (confirmedUtxos.length === 0) {
      console.log("No confirmed UTXOs found");
      return;
    }

    const utxo = confirmedUtxos[0];
    console.log(
      `Found UTXO: ${utxo.txid}:${utxo.vout} with ${utxo.value} sats`
    );

    // Create transaction manually
    const tx = new bitcoin.Transaction();
    tx.version = 2;
    tx.locktime = locktime;

    // Add input with proper sequence for OP_CHECKLOCKTIMEVERIFY
    // Sequence must be < 0xffffffff for locktime to be enforced
    tx.addInput(Buffer.from(utxo.txid, "hex").reverse(), utxo.vout, 0xfffffffe);

    // Add output (subtract fee)
    const fee = 1000;
    const outputValue = utxo.value - fee;
    tx.addOutput(
      bitcoin.address.toOutputScript(destinationAddress, network),
      outputValue
    );

    // Create key pair
    const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKeyHex, "hex"), {
      network,
    });

    // Create signature hash
    const redeemScript = Buffer.from(redeemScriptHex, "hex");
    const hashType = bitcoin.Transaction.SIGHASH_ALL;
    const signatureHash = tx.hashForSignature(0, redeemScript, hashType);

    // Sign with canonical encoding
    const signature = keyPair.sign(signatureHash);
    const signatureWithHashType = Buffer.concat([
      bitcoin.script.signature.encode(signature, hashType),
    ]);

    // Create scriptSig
    const scriptSig = bitcoin.script.compile([
      signatureWithHashType,
      redeemScript,
    ]);

    // Set input script
    tx.setInputScript(0, scriptSig);

    console.log("Transaction created successfully!");
    console.log("Transaction hex:", tx.toHex());
    console.log("Transaction ID:", tx.getId());

    // Ask for confirmation
    const readline = require("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question("Broadcast transaction? (y/n): ", async (answer) => {
      if (answer.toLowerCase() === "y") {
        try {
          const result = await api.broadcastTransaction(tx.toHex());
          console.log("✅ Transaction broadcasted successfully!");
          console.log("Transaction ID:", result.txid || tx.getId());
          console.log(
            `View on explorer: https://mempool.space/testnet/tx/${tx.getId()}`
          );
        } catch (error) {
          console.error("❌ Failed to broadcast:", error.message);
          console.log("Transaction hex for manual broadcast:", tx.toHex());
          console.log(
            "You can try broadcasting manually at: https://mempool.space/testnet/tx/push"
          );
        }
      } else {
        console.log("Transaction not broadcasted");
      }
      rl.close();
    });
  } catch (error) {
    console.error("Error:", error.message);
  }
}

spendTimelock();
