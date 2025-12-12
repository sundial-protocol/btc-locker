/**
 * BTC Locker - Bitcoin Timelock Script Library
 * A comprehensive library for creating and managing Bitcoin timelock scripts
 */

const bitcoin = require("bitcoinjs-lib");
const { BIP32Factory } = require("bip32");
const { ECPairFactory } = require("ecpair");
const ecc = require("tiny-secp256k1");

// Initialize BIP32 and ECPair with secp256k1
const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);

/**
 * Bitcoin Timelock Script Generator
 */
class BTCLocker {
  constructor(network = bitcoin.networks.bitcoin) {
    this.network = network;
  }

  /**
   * Create a simple timelock script (absolute time)
   * @param {number} locktime - Unix timestamp or block height
   * @param {Buffer|string} publicKey - Public key buffer or hex string
   * @returns {Object} Script details
   */
  createTimelockScript(locktime, publicKey) {
    if (typeof publicKey === "string") {
      publicKey = Buffer.from(publicKey, "hex");
    }

    const redeemScript = bitcoin.script.compile([
      bitcoin.script.number.encode(locktime),
      bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
      bitcoin.opcodes.OP_DROP,
      publicKey,
      bitcoin.opcodes.OP_CHECKSIG,
    ]);

    const scriptHash = bitcoin.crypto.hash160(redeemScript);
    const address = bitcoin.payments.p2sh({
      hash: scriptHash,
      network: this.network,
    }).address;

    return {
      redeemScript: redeemScript.toString("hex"),
      scriptHash: scriptHash.toString("hex"),
      address,
      locktime,
      publicKey: publicKey.toString("hex"),
      type: "timelock",
    };
  }

  /**
   * Create a relative timelock script
   * @param {number} sequence - Relative locktime in blocks
   * @param {Buffer|string} publicKey - Public key buffer or hex string
   * @returns {Object} Script details
   */
  createRelativeTimelockScript(sequence, publicKey) {
    if (typeof publicKey === "string") {
      publicKey = Buffer.from(publicKey, "hex");
    }

    const redeemScript = bitcoin.script.compile([
      bitcoin.script.number.encode(sequence),
      bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
      bitcoin.opcodes.OP_DROP,
      publicKey,
      bitcoin.opcodes.OP_CHECKSIG,
    ]);

    const scriptHash = bitcoin.crypto.hash160(redeemScript);
    const address = bitcoin.payments.p2sh({
      hash: scriptHash,
      network: this.network,
    }).address;

    return {
      redeemScript: redeemScript.toString("hex"),
      scriptHash: scriptHash.toString("hex"),
      address,
      sequence,
      publicKey: publicKey.toString("hex"),
      type: "relative-timelock",
    };
  }

  /**
   * Create a multisig timelock script
   * @param {number} locktime - Unix timestamp or block height
   * @param {number} m - Required signatures
   * @param {Array} publicKeys - Array of public key buffers or hex strings
   * @returns {Object} Script details
   */
  createMultisigTimelockScript(locktime, m, publicKeys) {
    const pubKeyBuffers = publicKeys.map((key) =>
      typeof key === "string" ? Buffer.from(key, "hex") : key
    );

    const redeemScript = bitcoin.script.compile([
      bitcoin.script.number.encode(locktime),
      bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
      bitcoin.opcodes.OP_DROP,
      bitcoin.script.number.encode(m),
      ...pubKeyBuffers,
      bitcoin.script.number.encode(publicKeys.length),
      bitcoin.opcodes.OP_CHECKMULTISIG,
    ]);

    const scriptHash = bitcoin.crypto.hash160(redeemScript);
    const address = bitcoin.payments.p2sh({
      hash: scriptHash,
      network: this.network,
    }).address;

    return {
      redeemScript: redeemScript.toString("hex"),
      scriptHash: scriptHash.toString("hex"),
      address,
      locktime,
      m,
      publicKeys: pubKeyBuffers.map((buf) => buf.toString("hex")),
      type: "multisig-timelock",
    };
  }

  /**
   * Create a HODL script with emergency escape
   * @param {number} locktime - Unix timestamp or block height
   * @param {Buffer|string} ownerPubKey - Owner's public key
   * @param {Buffer|string} penaltyPubKey - Penalty/Emergency public key
   * @returns {Object} Script details
   */
  createHodlScript(locktime, ownerPubKey, penaltyPubKey) {
    if (typeof ownerPubKey === "string") {
      ownerPubKey = Buffer.from(ownerPubKey, "hex");
    }
    if (typeof penaltyPubKey === "string") {
      penaltyPubKey = Buffer.from(penaltyPubKey, "hex");
    }

    const redeemScript = bitcoin.script.compile([
      bitcoin.opcodes.OP_IF,
      bitcoin.script.number.encode(locktime),
      bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
      bitcoin.opcodes.OP_DROP,
      ownerPubKey,
      bitcoin.opcodes.OP_CHECKSIG,
      bitcoin.opcodes.OP_ELSE,
      bitcoin.script.number.encode(2),
      ownerPubKey,
      penaltyPubKey,
      bitcoin.script.number.encode(2),
      bitcoin.opcodes.OP_CHECKMULTISIG,
      bitcoin.opcodes.OP_ENDIF,
    ]);

    const scriptHash = bitcoin.crypto.hash160(redeemScript);
    const address = bitcoin.payments.p2sh({
      hash: scriptHash,
      network: this.network,
    }).address;

    return {
      redeemScript: redeemScript.toString("hex"),
      scriptHash: scriptHash.toString("hex"),
      address,
      locktime,
      ownerPubKey: ownerPubKey.toString("hex"),
      penaltyPubKey: penaltyPubKey.toString("hex"),
      type: "hodl",
    };
  }

  /**
   * Create spending transaction for timelock scripts
   * @param {Object} scriptInfo - Script information from create methods
   * @param {Array} utxos - Array of UTXOs to spend
   * @param {string} destinationAddress - Where to send the funds
   * @param {number} fee - Transaction fee in satoshis
   * @param {Array} privateKeys - Private keys for signing
   * @returns {Object} Transaction details
   */
  createSpendingTransaction(
    scriptInfo,
    utxos,
    destinationAddress,
    fee,
    privateKeys
  ) {
    const psbt = new bitcoin.Psbt({ network: this.network });

    // Add inputs
    utxos.forEach((utxo) => {
      const input = {
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: Buffer.from(utxo.hex, "hex"),
        redeemScript: Buffer.from(scriptInfo.redeemScript, "hex"),
      };

      // Set sequence for relative timelock scripts
      if (scriptInfo.type === "relative-timelock") {
        input.sequence = scriptInfo.sequence;
      }

      psbt.addInput(input);
    });

    // Calculate total input value
    const totalInput = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
    const outputValue = totalInput - fee;

    // Add output
    psbt.addOutput({
      address: destinationAddress,
      value: outputValue,
    });

    // Set locktime for absolute timelock scripts
    if (
      scriptInfo.type === "timelock" ||
      scriptInfo.type === "multisig-timelock" ||
      scriptInfo.type === "hodl"
    ) {
      psbt.setLocktime(scriptInfo.locktime);
    }

    // Sign inputs
    privateKeys.forEach((privateKey, index) => {
      if (typeof privateKey === "string") {
        privateKey = Buffer.from(privateKey, "hex");
      }
      const keyPair = ECPair.fromPrivateKey(privateKey, {
        network: this.network,
      });
      psbt.signInput(index, keyPair);
    });

    // Finalize and build transaction
    psbt.finalizeAllInputs();
    const transaction = psbt.extractTransaction();

    return {
      hex: transaction.toHex(),
      txid: transaction.getId(),
      size: transaction.virtualSize(),
      fee,
    };
  }

  /**
   * Validate if a timelock has expired
   * @param {number} locktime - Locktime to check
   * @param {number} currentTime - Current timestamp (optional, defaults to now)
   * @returns {boolean} True if locktime has expired
   */
  isTimelockExpired(locktime, currentTime = Math.floor(Date.now() / 1000)) {
    if (locktime < 500000000) {
      // Block height locktime
      throw new Error("Block height validation requires current block height");
    }
    return currentTime >= locktime;
  }

  /**
   * Generate a new key pair
   * @returns {Object} Key pair with private key, public key, and address
   */
  generateKeyPair() {
    const keyPair = ECPair.makeRandom({ network: this.network });
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network: this.network,
    });

    return {
      privateKey: keyPair.privateKey.toString("hex"),
      publicKey: keyPair.publicKey.toString("hex"),
      address,
    };
  }

  /**
   * Generate key pair from existing private key
   * @param {string} privateKeyHex - Private key in hex format
   * @returns {Object} Key pair with address
   */
  generateKeyPairFromPrivateKey(privateKeyHex) {
    const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKeyHex, "hex"), {
      network: this.network,
    });
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network: this.network,
    });

    return {
      privateKey: keyPair.privateKey.toString("hex"),
      publicKey: keyPair.publicKey.toString("hex"),
      address,
      keyPair, // Include keyPair object for signing
    };
  }

  /**
   * Create a funding transaction to send Bitcoin to a timelock script
   * @param {Object} params - Transaction parameters
   * @param {Array} params.inputs - Input UTXOs
   * @param {Array} params.outputs - Output destinations
   * @param {string} params.privateKey - Private key for signing inputs
   * @returns {Object} Signed transaction
   */
  createFundingTransaction(params) {
    const { inputs, outputs, privateKey } = params;

    const psbt = new bitcoin.Psbt({ network: this.network });
    const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKey, "hex"), {
      network: this.network,
    });

    // Add inputs
    for (const input of inputs) {
      const inputData = {
        hash: input.txid,
        index: input.vout,
        witnessUtxo: {
          script: bitcoin.payments.p2wpkh({
            pubkey: keyPair.publicKey,
            network: this.network,
          }).output,
          value: input.value,
        },
      };

      psbt.addInput(inputData);
    }

    // Add outputs
    for (const output of outputs) {
      psbt.addOutput({
        address: output.address,
        value: output.value,
      });
    }

    // Sign all inputs
    for (let i = 0; i < inputs.length; i++) {
      try {
        psbt.signInput(i, keyPair);
      } catch (error) {
        console.warn(`Could not sign input ${i}:`, error.message);
        throw error; // Re-throw to help with debugging
      }
    }

    // Finalize and extract transaction
    psbt.finalizeAllInputs();
    return psbt.extractTransaction();
  }
}

module.exports = BTCLocker;
