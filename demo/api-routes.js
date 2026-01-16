/**
 * API Routes for BTC Locker with Swagger documentation
 */
import express from "express";
import { createRequire } from "module";

const router = express.Router();
const require = createRequire(import.meta.url);

// Import the BTC Locker library with proper fallback
let BTCLocker;

async function loadBTCLocker() {
  try {
    // Try to load from ES module export first
    const srcModule = await import("../dist/esm/index.js");
    BTCLocker = srcModule.BTCLocker || srcModule.default?.BTCLocker || srcModule.default;
  } catch (error) {
    try {
      // Fallback to CommonJS version
      const { createRequire } = await import("module");
      const require = createRequire(import.meta.url);
      const bundle = require("../dist/cjs/index.js");
      BTCLocker = bundle.BTCLocker || bundle.default?.BTCLocker || bundle.default;
    } catch (srcError) {
      console.error("Failed to load BTCLocker:", srcError);
      throw new Error("Could not load BTCLocker module");
    }
  }

  if (!BTCLocker) {
    throw new Error("BTCLocker class not found in loaded module");
  }
}

// Initialize BTCLocker on module load
let btcLockerReady = false;
loadBTCLocker()
  .then(() => {
    btcLockerReady = true;
    console.log("✅ BTCLocker loaded successfully");
  })
  .catch((error) => {
    console.error("❌ Failed to load BTCLocker:", error.message);
  });

// Helper function to handle async routes
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Middleware to check if BTCLocker is ready
const ensureBTCLockerReady = (req, res, next) => {
  if (!btcLockerReady) {
    return res.status(503).json({
      error: "BTC Locker module is not ready. Please try again in a moment.",
    });
  }
  next();
};

/**
 * @swagger
 * /api/keypair/generate:
 *   post:
 *     summary: Generate a new Bitcoin key pair
 *     tags: [KeyPair]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               network:
 *                 type: string
 *                 enum: [mainnet, testnet]
 *                 default: testnet
 *                 description: Bitcoin network
 *     responses:
 *       200:
 *         description: Successfully generated key pair
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KeyPair'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  "/keypair/generate",
  ensureBTCLockerReady,
  asyncHandler(async (req, res) => {
    const { network = "testnet" } = req.body;
    const bitcoin = require("bitcoinjs-lib");
    const networkObj =
      network === "mainnet"
        ? bitcoin.networks.bitcoin
        : bitcoin.networks.testnet;

    const locker = new BTCLocker(networkObj);
    await locker.init();

    const keyPair = await locker.generateKeyPair();
    res.json(keyPair);
  })
);

/**
 * @swagger
 * /api/keypair/from-private-key:
 *   post:
 *     summary: Generate key pair from existing private key
 *     tags: [KeyPair]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - privateKey
 *             properties:
 *               privateKey:
 *                 type: string
 *                 description: Private key in hex format
 *                 example: c0a83f5ac31833c5050674585059af899ae5ed62f5920426b3e3fd40670ff0dd
 *               network:
 *                 type: string
 *                 enum: [mainnet, testnet]
 *                 default: testnet
 *     responses:
 *       200:
 *         description: Successfully generated key pair from private key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KeyPair'
 *       400:
 *         description: Invalid private key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  "/keypair/from-private-key",
  ensureBTCLockerReady,
  asyncHandler(async (req, res) => {
    const { privateKey, network = "testnet" } = req.body;

    if (!privateKey) {
      return res.status(400).json({ error: "Private key is required" });
    }

    const bitcoin = require("bitcoinjs-lib");
    const networkObj =
      network === "mainnet"
        ? bitcoin.networks.bitcoin
        : bitcoin.networks.testnet;

    const locker = new BTCLocker(networkObj);
    await locker.init();

    const keyPair = await locker.generateKeyPairFromPrivateKey(privateKey);
    res.json(keyPair);
  })
);

/**
 * @swagger
 * /api/timelock/create:
 *   post:
 *     summary: Create a timelock script (absolute time)
 *     tags: [Timelock]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - locktime
 *               - publicKey
 *             properties:
 *               locktime:
 *                 type: integer
 *                 description: Unix timestamp or block height
 *                 example: 1640995200
 *               publicKey:
 *                 type: string
 *                 description: Public key in hex format
 *                 example: 03a40291efea7e0dcbacd37c192062d3cae101e9d21cd320c9e9f6ad6a7cac5a8c
 *               network:
 *                 type: string
 *                 enum: [mainnet, testnet]
 *                 default: testnet
 *     responses:
 *       200:
 *         description: Successfully created timelock script
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TimelockScript'
 *       400:
 *         description: Invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  "/timelock/create",
  ensureBTCLockerReady,
  asyncHandler(async (req, res) => {
    const { locktime, publicKey, network = "testnet" } = req.body;

    if (!locktime || !publicKey) {
      return res
        .status(400)
        .json({ error: "Locktime and public key are required" });
    }

    const bitcoin = require("bitcoinjs-lib");
    const networkObj =
      network === "mainnet"
        ? bitcoin.networks.bitcoin
        : bitcoin.networks.testnet;

    const locker = new BTCLocker(networkObj);
    await locker.init();

    const script = await locker.createTimelockScript(locktime, publicKey);
    res.json(script);
  })
);

/**
 * @swagger
 * /api/timelock/create-relative:
 *   post:
 *     summary: Create a relative timelock script (CSV)
 *     tags: [Timelock]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sequence
 *               - publicKey
 *             properties:
 *               sequence:
 *                 type: integer
 *                 description: Relative timelock value (blocks or time units)
 *                 example: 144
 *               publicKey:
 *                 type: string
 *                 description: Public key in hex format
 *                 example: 03a40291efea7e0dcbacd37c192062d3cae101e9d21cd320c9e9f6ad6a7cac5a8c
 *               network:
 *                 type: string
 *                 enum: [mainnet, testnet]
 *                 default: testnet
 *     responses:
 *       200:
 *         description: Successfully created relative timelock script
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/TimelockScript'
 *                 - type: object
 *                   properties:
 *                     sequence:
 *                       type: integer
 *                       description: The sequence value
 */
router.post(
  "/timelock/create-relative",
  ensureBTCLockerReady,
  asyncHandler(async (req, res) => {
    const { sequence, publicKey, network = "testnet" } = req.body;

    if (!sequence || !publicKey) {
      return res
        .status(400)
        .json({ error: "Sequence and public key are required" });
    }

    const bitcoin = require("bitcoinjs-lib");
    const networkObj =
      network === "mainnet"
        ? bitcoin.networks.bitcoin
        : bitcoin.networks.testnet;

    const locker = new BTCLocker(networkObj);
    await locker.init();

    const script = await locker.createRelativeTimelockScript(
      sequence,
      publicKey
    );
    res.json(script);
  })
);

/**
 * @swagger
 * /api/multisig/create:
 *   post:
 *     summary: Create a multisig timelock script
 *     tags: [Multisig]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - locktime
 *               - m
 *               - publicKeys
 *             properties:
 *               locktime:
 *                 type: integer
 *                 description: Unix timestamp or block height
 *                 example: 1640995200
 *               m:
 *                 type: integer
 *                 description: Required number of signatures
 *                 example: 2
 *               publicKeys:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of public keys in hex format
 *                 example: ['03a40291efea7e0dcbacd37c192062d3cae101e9d21cd320c9e9f6ad6a7cac5a8c', '02f55e8f3bb415351e1d522cae820e9f9ca9a6a5a1ddda9bd44db6654cdc5e2eef']
 *               network:
 *                 type: string
 *                 enum: [mainnet, testnet]
 *                 default: testnet
 *     responses:
 *       200:
 *         description: Successfully created multisig timelock script
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MultisigTimelockScript'
 */
router.post(
  "/multisig/create",
  ensureBTCLockerReady,
  asyncHandler(async (req, res) => {
    const { locktime, m, publicKeys, network = "testnet" } = req.body;

    if (!locktime || !m || !publicKeys || !Array.isArray(publicKeys)) {
      return res
        .status(400)
        .json({ error: "Locktime, m, and publicKeys array are required" });
    }

    const bitcoin = require("bitcoinjs-lib");
    const networkObj =
      network === "mainnet"
        ? bitcoin.networks.bitcoin
        : bitcoin.networks.testnet;

    const locker = new BTCLocker(networkObj);
    await locker.init();

    const script = await locker.createMultisigTimelockScript(
      locktime,
      m,
      publicKeys
    );
    res.json(script);
  })
);

/**
 * @swagger
 * /api/hodl/create:
 *   post:
 *     summary: Create a HODL script with emergency escape
 *     tags: [HODL]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - locktime
 *               - ownerPubKey
 *               - penaltyPubKey
 *             properties:
 *               locktime:
 *                 type: integer
 *                 description: Unix timestamp or block height
 *                 example: 1640995200
 *               ownerPubKey:
 *                 type: string
 *                 description: Owner's public key in hex format
 *                 example: 03a40291efea7e0dcbacd37c192062d3cae101e9d21cd320c9e9f6ad6a7cac5a8c
 *               penaltyPubKey:
 *                 type: string
 *                 description: Emergency escape public key in hex format
 *                 example: 02f55e8f3bb415351e1d522cae820e9f9ca9a6a5a1ddda9bd44db6654cdc5e2eef
 *               network:
 *                 type: string
 *                 enum: [mainnet, testnet]
 *                 default: testnet
 *     responses:
 *       200:
 *         description: Successfully created HODL script
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HodlScript'
 */
router.post(
  "/hodl/create",
  ensureBTCLockerReady,
  asyncHandler(async (req, res) => {
    const {
      locktime,
      ownerPubKey,
      penaltyPubKey,
      network = "testnet",
    } = req.body;

    if (!locktime || !ownerPubKey || !penaltyPubKey) {
      return res.status(400).json({
        error: "Locktime, ownerPubKey, and penaltyPubKey are required",
      });
    }

    const bitcoin = require("bitcoinjs-lib");
    const networkObj =
      network === "mainnet"
        ? bitcoin.networks.bitcoin
        : bitcoin.networks.testnet;

    const locker = new BTCLocker(networkObj);
    await locker.init();

    const script = await locker.createHodlScript(
      locktime,
      ownerPubKey,
      penaltyPubKey
    );
    res.json(script);
  })
);

// Error handling middleware
router.use((error, req, res, next) => {
  console.error("API Error:", error);
  res.status(500).json({
    error: error.message || "Internal server error",
    code: error.code || "UNKNOWN_ERROR",
  });
});

/**
 * @swagger
 * /api/transactions/funding:
 *   post:
 *     summary: Create a funding transaction to send Bitcoin to a timelock script
 *     tags: [Transactions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inputs
 *               - timelockAddress
 *               - amount
 *               - changeAddress
 *               - privateKeys
 *             properties:
 *               inputs:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     txid:
 *                       type: string
 *                       description: Transaction ID of the UTXO
 *                     vout:
 *                       type: integer
 *                       description: Output index of the UTXO
 *                     value:
 *                       type: integer
 *                       description: Value in satoshis
 *               timelockAddress:
 *                 type: string
 *                 description: Address of the timelock script
 *               amount:
 *                 type: integer
 *                 description: Amount to send to timelock (satoshis)
 *               changeAddress:
 *                 type: string
 *                 description: Address for change output
 *               privateKeys:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Private keys for signing inputs
 *               feeRate:
 *                 type: integer
 *                 default: 10
 *                 description: Fee rate in sat/byte
 *               network:
 *                 type: string
 *                 enum: [mainnet, testnet]
 *                 default: testnet
 *     responses:
 *       200:
 *         description: Successfully created funding transaction
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transaction'
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Server error
 */
router.post(
  "/transactions/funding",
  ensureBTCLockerReady,
  asyncHandler(async (req, res) => {
    const {
      inputs,
      timelockAddress,
      amount,
      changeAddress,
      privateKeys,
      feeRate = 10,
      network = "testnet",
    } = req.body;

    if (
      !inputs ||
      !timelockAddress ||
      !amount ||
      !changeAddress ||
      !privateKeys
    ) {
      return res.status(400).json({
        error:
          "Missing required parameters: inputs, timelockAddress, amount, changeAddress, privateKeys",
      });
    }

    const bitcoin = require("bitcoinjs-lib");
    const networkObj =
      network === "mainnet"
        ? bitcoin.networks.bitcoin
        : bitcoin.networks.testnet;

    try {
      const locker = new BTCLocker(networkObj);
      await locker.init();

      const transaction = await locker.createFundingTransaction({
        inputs,
        timelockAddress,
        amount,
        changeAddress,
        privateKeys,
        feeRate,
      });

      res.json({
        success: true,
        data: transaction,
        message: "Funding transaction created successfully",
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        code: "FUNDING_TRANSACTION_FAILED",
      });
    }
  })
);

/**
 * @swagger
 * /api/transactions/spending:
 *   post:
 *     summary: Create spending transaction for timelock scripts
 *     tags: [Transactions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inputs
 *               - outputs
 *               - redeemScript
 *               - privateKeys
 *             properties:
 *               inputs:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     txid:
 *                       type: string
 *                     vout:
 *                       type: integer
 *                     value:
 *                       type: integer
 *               outputs:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     address:
 *                       type: string
 *                     value:
 *                       type: integer
 *               redeemScript:
 *                 type: string
 *                 description: Redeem script in hex format
 *               privateKeys:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Private keys for signing (hex format)
 *               locktime:
 *                 type: integer
 *                 description: Transaction locktime (optional)
 *               network:
 *                 type: string
 *                 enum: [mainnet, testnet]
 *                 default: testnet
 *     responses:
 *       200:
 *         description: Successfully created spending transaction
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transaction'
 *       400:
 *         description: Invalid parameters or timelock not expired
 *       500:
 *         description: Server error
 */
router.post(
  "/transactions/spending",
  ensureBTCLockerReady,
  asyncHandler(async (req, res) => {
    const {
      inputs,
      outputs,
      redeemScript,
      privateKeys,
      locktime,
      network = "testnet",
    } = req.body;

    if (!inputs || !outputs || !redeemScript || !privateKeys) {
      return res.status(400).json({
        error:
          "Missing required parameters: inputs, outputs, redeemScript, privateKeys",
      });
    }

    const bitcoin = require("bitcoinjs-lib");
    const networkObj =
      network === "mainnet"
        ? bitcoin.networks.bitcoin
        : bitcoin.networks.testnet;

    try {
      const locker = new BTCLocker(networkObj);
      await locker.init();

      const transaction = await locker.createSpendingTransaction({
        inputs,
        outputs,
        redeemScript,
        privateKeys,
        locktime,
      });

      res.json({
        success: true,
        data: transaction,
        message: "Spending transaction created successfully",
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        code: "SPENDING_TRANSACTION_FAILED",
      });
    }
  })
);

/**
 * @swagger
 * /api/yield/distribute:
 *   post:
 *     summary: Distribute yield back to a timelock script
 *     tags: [Yield]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inputs
 *               - timelockAddress
 *               - amount
 *               - privateKey
 *             properties:
 *               inputs:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     txid:
 *                       type: string
 *                       description: Transaction ID of the UTXO
 *                     vout:
 *                       type: integer
 *                       description: Output index of the UTXO
 *                     value:
 *                       type: integer
 *                       description: Value in satoshis
 *               timelockAddress:
 *                 type: string
 *                 description: Timelock script address to send yield to
 *               amount:
 *                 type: integer
 *                 description: Amount to distribute in satoshis
 *               privateKey:
 *                 type: string
 *                 description: Private key for signing inputs (hex format)
 *               memo:
 *                 type: string
 *                 description: Optional memo for the distribution
 *               changeAddress:
 *                 type: string
 *                 description: Change address (defaults to derived from private key)
 *               feeRate:
 *                 type: integer
 *                 default: 10
 *                 description: Fee rate in sat/byte
 *               network:
 *                 type: string
 *                 enum: [mainnet, testnet]
 *                 default: testnet
 *     responses:
 *       200:
 *         description: Successfully distributed yield
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Transaction'
 *                 - type: object
 *                   properties:
 *                     memo:
 *                       type: string
 *                       description: Memo if provided
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Server error
 */
router.post(
  "/yield/distribute",
  ensureBTCLockerReady,
  asyncHandler(async (req, res) => {
    const {
      inputs,
      timelockAddress,
      amount,
      privateKey,
      memo,
      changeAddress,
      feeRate = 10,
      network = "testnet",
    } = req.body;

    if (!inputs || !timelockAddress || !amount || !privateKey) {
      return res.status(400).json({
        error:
          "Missing required parameters: inputs, timelockAddress, amount, privateKey",
      });
    }

    const bitcoin = require("bitcoinjs-lib");
    const networkObj =
      network === "mainnet"
        ? bitcoin.networks.bitcoin
        : bitcoin.networks.testnet;

    try {
      const locker = new BTCLocker(networkObj);
      await locker.init();

      const transaction = await locker.distributeYield({
        inputs,
        timelockAddress,
        amount,
        privateKey,
        memo,
        changeAddress,
        feeRate,
      });

      res.json({
        success: true,
        data: transaction,
        message: "Yield distributed successfully",
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        code: "YIELD_DISTRIBUTION_FAILED",
      });
    }
  })
);

export default router;
