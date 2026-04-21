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
    const srcModule = await import("@sundial-protocol/btc-locker");
    BTCLocker =
      srcModule.BTCLocker || srcModule.default?.BTCLocker || srcModule.default;
  } catch (error) {
    try {
      // Fallback to CommonJS version
      const { createRequire } = await import("module");
      const require = createRequire(import.meta.url);
      const bundle = require("@sundial-protocol/btc-locker");
      BTCLocker =
        bundle.BTCLocker || bundle.default?.BTCLocker || bundle.default;
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

    // Convert 'mainnet' to 'bitcoin' for consistency with NetworkType names
    const networkName = network === "mainnet" ? "bitcoin" : network;

    const locker = new BTCLocker(networkName);
    await locker.init();

    const keyPair = await locker.generateKeyPair();
    res.json(keyPair);
  }),
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

    const keyPair = await locker.keyPairGenerator.generateKeyPairFromPrivateKey(
      privateKey,
    );
    res.json({
      publicKey: keyPair.publicKey,
      address: keyPair.address,
    });
  }),
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
  }),
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
      publicKey,
    );
    res.json(script);
  }),
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
  }),
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
  }),
);

/**
 * @swagger
 * /api/yield/distribute:
 *   post:
 *     summary: Create a distribution transaction
 *     tags: [Distribution]
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
 *                 description: Timelock script address to receive distribution
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
 *         description: Distribution transaction created successfully
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

      const transaction = await locker.createDistributionTransaction({
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
        message: "Distribution transaction created successfully",
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        code: "DISTRIBUTION_FAILED",
      });
    }
  }),
);

/**
 * @swagger
 * /api/escrow/create:
 *   post:
 *     summary: Create a time-based escrow script
 *     tags: [Escrow]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - deadline
 *               - beforePublicKey
 *               - afterPublicKey
 *             properties:
 *               deadline:
 *                 type: integer
 *                 description: Unix timestamp deadline
 *                 example: 1640995200
 *               beforePublicKey:
 *                 type: string
 *                 description: Public key for user who can withdraw before deadline
 *                 example: 03a40291efea7e0dcbacd37c192062d3cae101e9d21cd320c9e9f6ad6a7cac5a8c
 *               afterPublicKey:
 *                 type: string
 *                 description: Public key for user who can withdraw after deadline
 *                 example: 0225a1e61f898173040566c0dd8365b51f48ee87e15b25c10d6e5c87b2c8e8d8e5
 *               network:
 *                 type: string
 *                 enum: [mainnet, testnet]
 *                 default: testnet
 *     responses:
 *       200:
 *         description: Successfully created escrow script
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EscrowScript'
 *       400:
 *         description: Invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  "/escrow/create",
  ensureBTCLockerReady,
  asyncHandler(async (req, res) => {
    const {
      deadline,
      beforePublicKey,
      afterPublicKey,
      network = "testnet",
    } = req.body;

    if (!deadline || !beforePublicKey || !afterPublicKey) {
      return res.status(400).json({
        error:
          "Missing required parameters: deadline, beforePublicKey, afterPublicKey",
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

      const script = await locker.createEscrowScript(
        deadline,
        beforePublicKey,
        afterPublicKey,
      );
      res.json({
        success: true,
        data: script,
        message: "Escrow script created successfully",
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        code: "ESCROW_SCRIPT_FAILED",
      });
    }
  }),
);

/**
 * @swagger
 * /api/escrow/spend:
 *   post:
 *     summary: Create claim transaction (spend from escrow script)
 *     tags: [Escrow]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - scriptData
 *               - utxoTxId
 *               - utxoIndex
 *               - amount
 *               - outputAddress
 *               - spendAfterDeadline
 *               - privateKey
 *             properties:
 *               scriptData:
 *                 type: object
 *                 description: Script data from createEscrowScript
 *               utxoTxId:
 *                 type: string
 *                 description: Transaction ID of the UTXO to spend
 *               utxoIndex:
 *                 type: integer
 *                 description: Output index of the UTXO to spend
 *               amount:
 *                 type: integer
 *                 description: Amount in satoshis to spend
 *               outputAddress:
 *                 type: string
 *                 description: Address to send funds to
 *               spendAfterDeadline:
 *                 type: boolean
 *                 description: Whether spending after deadline (true) or before (false)
 *               privateKey:
 *                 type: string
 *                 description: Private key for signing (hex format)
 *               currentTime:
 *                 type: integer
 *                 description: Current time for validation (optional)
 *               network:
 *                 type: string
 *                 enum: [mainnet, testnet]
 *                 default: testnet
 *     responses:
 *       200:
 *         description: Claim transaction created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transaction'
 *       400:
 *         description: Invalid parameters or timing violation
 *       500:
 *         description: Server error
 */
router.post(
  "/escrow/spend",
  ensureBTCLockerReady,
  asyncHandler(async (req, res) => {
    const {
      scriptData,
      utxoTxId,
      utxoIndex,
      amount,
      outputAddress,
      spendAfterDeadline,
      privateKey,
      currentTime,
      network = "testnet",
    } = req.body;

    if (
      !scriptData ||
      !utxoTxId ||
      utxoIndex === undefined ||
      !amount ||
      !outputAddress ||
      spendAfterDeadline === undefined ||
      !privateKey
    ) {
      return res.status(400).json({
        error:
          "Missing required parameters: scriptData, utxoTxId, utxoIndex, amount, outputAddress, spendAfterDeadline, privateKey",
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

      const transaction = await locker.createClaimTransaction({
        scriptData,
        utxoTxId,
        utxoIndex,
        amount,
        outputAddress,
        spendAfterDeadline,
        currentTime,
      });

      res.json({
        success: true,
        data: transaction,
        message: "Claim transaction created successfully",
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        code: "CLAIM_FAILED",
      });
    }
  }),
);

/**
 * @swagger
 * /api/deposit:
 *   post:
 *     summary: Create deposit transaction
 *     tags: [Dawn]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sourceAddress
 *               - escrowAddress
 *               - escrowAmount
 *               - timelockAddress
 *               - timelockAmount
 *             properties:
 *               inputs:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/UTXO'
 *                 description: Specific UTXOs to use (optional - will auto-select from sourceAddress if not provided)
 *               sourceAddress:
 *                 type: string
 *                 description: Source address for automatic UTXO selection
 *               escrowAddress:
 *                 type: string
 *                 description: Escrow script address
 *               escrowAmount:
 *                 type: integer
 *                 description: Amount to send to escrow in satoshis
 *               timelockAddress:
 *                 type: string
 *                 description: Timelock script address
 *               timelockAmount:
 *                 type: integer
 *                 description: Amount to send to timelock in satoshis
 *               changeAddress:
 *                 type: string
 *                 description: Optional change address
 *               feeRate:
 *                 type: integer
 *                 default: 10
 *                 description: Fee rate in sat/byte
 *               feeAddress:
 *                 type: string
 *                 description: Optional protocol fee address
 *               protocolFeeAmount:
 *                 type: integer
 *                 description: Optional protocol fee amount in satoshis
 *               metadata:
 *                 type: string
 *                 description: Optional metadata (max 80 bytes)
 *               network:
 *                 type: string
 *                 enum: [mainnet, testnet]
 *                 default: testnet
 *     responses:
 *       200:
 *         description: Deposit transaction created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DepositResult'
 *       400:
 *         description: Invalid parameters or insufficient funds
 *       500:
 *         description: Server error
 */
router.post(
  "/deposit",
  ensureBTCLockerReady,
  asyncHandler(async (req, res) => {
    const {
      inputs,
      sourceAddress,
      escrowAddress,
      escrowAmount,
      timelockAddress,
      timelockAmount,
      changeAddress,
      feeRate = 10,
      feeAddress,
      protocolFeeAmount,
      metadata,
      network = "testnet",
    } = req.body;

    if (
      !sourceAddress ||
      !escrowAddress ||
      !escrowAmount ||
      !timelockAddress ||
      !timelockAmount
    ) {
      return res.status(400).json({
        error:
          "Missing required parameters: sourceAddress, escrowAddress, escrowAmount, timelockAddress, timelockAmount",
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

      const transaction = await locker.createDepositTransaction({
        inputs,
        sourceAddress,
        escrowAddress,
        escrowAmount,
        timelockAddress,
        timelockAmount,
        changeAddress,
        feeRate,
        feeAddress,
        protocolFeeAmount,
        metadata,
      });

      res.json({
        success: true,
        data: transaction,
        message: "Deposit transaction created successfully",
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        code: "DEPOSIT_FAILED",
      });
    }
  }),
);

/**
 * @swagger
 * /api/deposit/calculate:
 *   post:
 *     summary: Calculate optimal amounts for deposit
 *     tags: [Dawn]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sourceAddress
 *               - desiredEscrowAmount
 *               - desiredTimelockAmount
 *             properties:
 *               inputs:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     value:
 *                       type: integer
 *                 description: Available inputs (optional - will fetch from sourceAddress if not provided)
 *               sourceAddress:
 *                 type: string
 *                 description: Source address for automatic UTXO fetching
 *               desiredEscrowAmount:
 *                 type: integer
 *                 description: Desired amount for escrow output in satoshis
 *               desiredTimelockAmount:
 *                 type: integer
 *                 description: Desired amount for timelock output in satoshis
 *               includeChange:
 *                 type: boolean
 *                 default: false
 *                 description: Whether to include change output in calculation
 *               feeRate:
 *                 type: integer
 *                 default: 10
 *                 description: Fee rate in sat/byte
 *               protocolFeeAmount:
 *                 type: integer
 *                 description: Optional protocol fee amount in satoshis
 *               metadata:
 *                 type: string
 *                 description: Optional metadata (max 80 bytes)
 *               network:
 *                 type: string
 *                 enum: [mainnet, testnet]
 *                 default: testnet
 *     responses:
 *       200:
 *         description: Deposit calculation completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DepositCalculationResult'
 *       400:
 *         description: Invalid parameters
 *       500:
 *         description: Server error
 */
router.post(
  "/deposit/calculate",
  ensureBTCLockerReady,
  asyncHandler(async (req, res) => {
    const {
      inputs,
      sourceAddress,
      desiredEscrowAmount,
      desiredTimelockAmount,
      includeChange = false,
      feeRate = 10,
      protocolFeeAmount,
      metadata,
      network = "testnet",
    } = req.body;

    if (!sourceAddress || !desiredEscrowAmount || !desiredTimelockAmount) {
      return res.status(400).json({
        error:
          "Missing required parameters: sourceAddress, desiredEscrowAmount, desiredTimelockAmount",
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

      const calculation = await locker.calculateDepositAmounts({
        inputs,
        sourceAddress,
        desiredEscrowAmount,
        desiredTimelockAmount,
        includeChange,
        feeRate,
        protocolFeeAmount,
        metadata,
      });

      res.json({
        success: true,
        data: calculation,
        message: "Deposit calculation completed successfully",
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        code: "DEPOSIT_CALCULATION_FAILED",
      });
    }
  }),
);

/**
 * @swagger
 * /api/withdraw:
 *   post:
 *     summary: Create withdrawal transaction combining escrow and timelock inputs
 *     tags: [Dawn]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - escrowRedeemScript
 *               - timelockRedeemScript
 *               - destination
 *             properties:
 *               escrowInputs:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/UTXO'
 *                 description: Escrow inputs (optional - will fetch all from escrowAddress if not provided)
 *               escrowAddress:
 *                 type: string
 *                 description: Escrow script address (optional - calculated from script if not provided)
 *               escrowRedeemScript:
 *                 type: string
 *                 description: Escrow redeem script in hex format
 *               timelockInputs:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/UTXO'
 *                 description: Timelock inputs (optional - will fetch all from timelockAddress if not provided)
 *               timelockAddress:
 *                 type: string
 *                 description: Timelock script address (optional - calculated from script if not provided)
 *               timelockRedeemScript:
 *                 type: string
 *                 description: Timelock redeem script in hex format
 *               destination:
 *                 type: string
 *                 description: Destination address for combined withdrawal
 *               feeAmount:
 *                 type: integer
 *                 default: 2000
 *                 description: Transaction fee in satoshis
 *               feeAddress:
 *                 type: string
 *                 description: Optional protocol fee address
 *               protocolFeeAmount:
 *                 type: integer
 *                 description: Optional protocol fee amount in satoshis
 *               metadata:
 *                 type: string
 *                 description: Optional metadata (max 80 bytes)
 *               network:
 *                 type: string
 *                 enum: [mainnet, testnet]
 *                 default: testnet
 *     responses:
 *       200:
 *         description: Withdrawal transaction created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: string
 *                   description: Unsigned PSBT as base64 string
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid parameters or timing violation
 *       500:
 *         description: Server error
 */
router.post(
  "/withdraw",
  ensureBTCLockerReady,
  asyncHandler(async (req, res) => {
    const {
      escrowInputs,
      escrowAddress,
      escrowRedeemScript,
      timelockInputs,
      timelockAddress,
      timelockRedeemScript,
      destination,
      feeAmount = 2000,
      feeAddress,
      protocolFeeAmount,
      metadata,
      network = "testnet",
    } = req.body;

    if (!escrowRedeemScript || !timelockRedeemScript || !destination) {
      return res.status(400).json({
        error:
          "Missing required parameters: escrowRedeemScript, timelockRedeemScript, destination",
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

      const transaction = await locker.createWithdrawalTransaction({
        escrowInputs,
        escrowAddress,
        escrowRedeemScript,
        timelockInputs,
        timelockAddress,
        timelockRedeemScript,
        destination,
        feeAmount,
        feeAddress,
        protocolFeeAmount,
        metadata,
      });

      res.json({
        success: true,
        data: transaction,
        message: "Withdrawal transaction created successfully",
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        code: "WITHDRAWAL_FAILED",
      });
    }
  }),
);

/**
 * @swagger
 * /api/utils/validate-timelock:
 *   post:
 *     summary: Check if a timelock has expired
 *     tags: [Utilities]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - locktime
 *             properties:
 *               locktime:
 *                 type: integer
 *                 description: Unix timestamp or block height to check
 *                 example: 1640995200
 *               currentTime:
 *                 type: integer
 *                 description: Current time for comparison (optional, defaults to now)
 *                 example: 1641081600
 *               network:
 *                 type: string
 *                 enum: [mainnet, testnet]
 *                 default: testnet
 *     responses:
 *       200:
 *         description: Timelock validation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     expired:
 *                       type: boolean
 *                       description: Whether the timelock has expired
 *                     locktime:
 *                       type: integer
 *                       description: The locktime value that was checked
 *                     currentTime:
 *                       type: integer
 *                       description: The current time used for comparison
 *                     timeRemaining:
 *                       type: integer
 *                       description: Seconds remaining until expiration (negative if expired)
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid locktime
 *       500:
 *         description: Server error
 */
router.post(
  "/utils/validate-timelock",
  ensureBTCLockerReady,
  asyncHandler(async (req, res) => {
    const { locktime, currentTime, network = "testnet" } = req.body;

    if (!locktime) {
      return res.status(400).json({
        error: "Missing required parameter: locktime",
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

      const currentTimeToUse = currentTime || Math.floor(Date.now() / 1000);
      const expired = locker.isTimelockExpired(locktime, currentTimeToUse);
      const timeRemaining = locktime - currentTimeToUse;

      res.json({
        success: true,
        data: {
          expired,
          locktime,
          currentTime: currentTimeToUse,
          timeRemaining,
        },
        message: "Timelock validation completed successfully",
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        code: "TIMELOCK_VALIDATION_FAILED",
      });
    }
  }),
);

/**
 * @swagger
 * /api/utils/validate-address:
 *   post:
 *     summary: Validate a Bitcoin address
 *     tags: [Utilities]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - address
 *             properties:
 *               address:
 *                 type: string
 *                 description: Bitcoin address to validate
 *                 example: tb1q63558dl8w2hzwyz994k5fc6x0pzc986zap2suc
 *               network:
 *                 type: string
 *                 enum: [mainnet, testnet]
 *                 default: testnet
 *     responses:
 *       200:
 *         description: Address validation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     valid:
 *                       type: boolean
 *                       description: Whether the address is valid
 *                     address:
 *                       type: string
 *                       description: The address that was validated
 *                     network:
 *                       type: string
 *                       description: Network the address is valid for
 *                     type:
 *                       type: string
 *                       description: Address type (P2PKH, P2SH, P2WPKH, etc.)
 *                 message:
 *                   type: string
 *       400:
 *         description: Missing address parameter
 *       500:
 *         description: Server error
 */
router.post(
  "/utils/validate-address",
  ensureBTCLockerReady,
  asyncHandler(async (req, res) => {
    const { address, network = "testnet" } = req.body;

    if (!address) {
      return res.status(400).json({
        error: "Missing required parameter: address",
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

      let valid = false;
      let addressType = "unknown";

      try {
        // Try to decode as different address types
        if (address.startsWith("bc1") || address.startsWith("tb1")) {
          // Bech32 address
          bitcoin.address.fromBech32(address);
          valid = true;
          addressType = address.length === 42 ? "P2WPKH" : "P2WSH";
        } else if (
          address.startsWith("1") ||
          address.startsWith("m") ||
          address.startsWith("n")
        ) {
          // Base58 P2PKH
          bitcoin.address.fromBase58Check(address);
          valid = true;
          addressType = "P2PKH";
        } else if (address.startsWith("3") || address.startsWith("2")) {
          // Base58 P2SH
          bitcoin.address.fromBase58Check(address);
          valid = true;
          addressType = "P2SH";
        }
      } catch (e) {
        valid = false;
      }

      res.json({
        success: true,
        data: {
          valid,
          address,
          network: network,
          type: addressType,
        },
        message: "Address validation completed successfully",
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        code: "ADDRESS_VALIDATION_FAILED",
      });
    }
  }),
);

/**
 * @swagger
 * /api/utils/estimate-fees:
 *   get:
 *     summary: Get current fee estimates
 *     tags: [Utilities]
 *     parameters:
 *       - in: query
 *         name: network
 *         schema:
 *           type: string
 *           enum: [mainnet, testnet]
 *           default: testnet
 *         description: Bitcoin network
 *     responses:
 *       200:
 *         description: Current fee estimates
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     fastestFee:
 *                       type: integer
 *                       description: Fee for fastest confirmation (sat/vB)
 *                     halfHourFee:
 *                       type: integer
 *                       description: Fee for ~30 minute confirmation (sat/vB)
 *                     hourFee:
 *                       type: integer
 *                       description: Fee for ~1 hour confirmation (sat/vB)
 *                     economyFee:
 *                       type: integer
 *                       description: Economy fee rate (sat/vB)
 *                     minimumFee:
 *                       type: integer
 *                       description: Minimum relay fee rate (sat/vB)
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.get(
  "/utils/estimate-fees",
  ensureBTCLockerReady,
  asyncHandler(async (req, res) => {
    const { network = "testnet" } = req.query;

    const bitcoin = require("bitcoinjs-lib");
    const networkObj =
      network === "mainnet"
        ? bitcoin.networks.bitcoin
        : bitcoin.networks.testnet;

    try {
      const locker = new BTCLocker(networkObj);
      await locker.init();

      // Try to get fee estimates from the API
      let feeEstimates;
      try {
        feeEstimates = await locker.api.getFeeEstimates();
      } catch (error) {
        // Fallback to default estimates if API fails
        feeEstimates = {
          fastestFee: 20,
          halfHourFee: 15,
          hourFee: 10,
          economyFee: 5,
          minimumFee: 1,
        };
      }

      res.json({
        success: true,
        data: feeEstimates,
        message: "Fee estimates retrieved successfully",
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        code: "FEE_ESTIMATION_FAILED",
      });
    }
  }),
);

export default router;
