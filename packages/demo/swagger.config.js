/**
 * Swagger configuration for BTC Locker API
 */
import swaggerJsdoc from "swagger-jsdoc";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "BTC Locker API",
      version: "1.0.9",
      description:
        "A comprehensive Bitcoin timelock script library for creating and managing time-locked transactions",
      license: {
        name: "MIT",
        url: "https://github.com/sundial-protocol/btc-locker/blob/master/LICENSE",
      },
      contact: {
        name: "Sundial Protocol",
        url: "https://github.com/sundial-protocol/btc-locker",
        email: "support@sundial-protocol.com",
      },
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Development server",
      },
    ],
    tags: [
      {
        name: "KeyPair",
        description: "Bitcoin key pair generation and management",
      },
      {
        name: "Timelock",
        description: "Timelock script creation (absolute and relative)",
      },
      {
        name: "Transactions",
        description: "Transaction creation and spending operations",
      },
      {
        name: "Yield",
        description: "Yield distribution to timelock addresses",
      },
      {
        name: "Escrow",
        description: "Time-based escrow script creation and spending",
      },
      {
        name: "Dawn",
        description: "Dawn Protocol staking and withdrawal operations",
      },
      {
        name: "Utilities",
        description: "Utility functions for script analysis and validation",
      },
    ],
    components: {
      schemas: {
        KeyPair: {
          type: "object",
          properties: {
            privateKey: {
              type: "string",
              description: "Private key in hex format (64 characters)",
              example:
                "c0a83f5ac31833c5050674585059af899ae5ed62f5920426b3e3fd40670ff0dd",
            },
            publicKey: {
              type: "string",
              description: "Public key in hex format",
              example:
                "03a40291efea7e0dcbacd37c192062d3cae101e9d21cd320c9e9f6ad6a7cac5a8c",
            },
            address: {
              type: "string",
              description: "Bitcoin address (P2WPKH)",
              example: "tb1q63558dl8w2hzwyz994k5fc6x0pzc986zap2suc",
            },
          },
        },
        TimelockScript: {
          type: "object",
          properties: {
            script: {
              type: "string",
              description: "Compiled script as hex buffer",
              example: "63210225...",
            },
            scriptHex: {
              type: "string",
              description: "Script in hex format",
              example: "63210225...",
            },
            address: {
              type: "string",
              description: "P2SH address for the script",
              example: "3QJmV3qfvL9SuYo34YihAf3sRCW3qSinyC",
            },
            redeemScript: {
              type: "string",
              description: "Redeem script in hex format",
              example: "63210225...",
            },
            locktime: {
              type: "integer",
              description:
                "The locktime value (Unix timestamp or block height)",
              example: 1640995200,
            },
          },
        },
        UTXO: {
          type: "object",
          properties: {
            txid: {
              type: "string",
              description: "Transaction ID",
              example:
                "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
            },
            vout: {
              type: "integer",
              description: "Output index",
              example: 0,
            },
            value: {
              type: "integer",
              description: "Value in satoshis",
              example: 100000,
            },
          },
        },
        TransactionOutput: {
          type: "object",
          properties: {
            address: {
              type: "string",
              description: "Destination address",
              example: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
            },
            value: {
              type: "integer",
              description: "Amount in satoshis",
              example: 95000,
            },
          },
        },
        Transaction: {
          type: "object",
          properties: {
            hex: {
              type: "string",
              description: "Signed transaction in hex format",
              example: "0200000001...",
            },
            txid: {
              type: "string",
              description: "Transaction ID",
              example:
                "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
            },
            size: {
              type: "integer",
              description: "Transaction size in bytes",
              example: 250,
            },
            fee: {
              type: "integer",
              description: "Transaction fee in satoshis",
              example: 5000,
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: {
              type: "string",
              description: "Error message",
            },
            code: {
              type: "string",
              description: "Error code",
            },
            details: {
              type: "object",
              description: "Additional error details",
            },
          },
        },
        EscrowScript: {
          type: "object",
          properties: {
            script: {
              type: "string",
              description: "Compiled script as hex buffer",
              example: "63210225...",
            },
            scriptHex: {
              type: "string",
              description: "Script in hex format",
              example: "63210225...",
            },
            address: {
              type: "string",
              description: "P2SH address for the escrow script",
              example: "3QJmV3qfvL9SuYo34YihAf3sRCW3qSinyC",
            },
            redeemScript: {
              type: "string",
              description: "Redeem script in hex format",
              example: "63210225...",
            },
            deadline: {
              type: "integer",
              description: "The deadline timestamp",
              example: 1640995200,
            },
            beforePublicKey: {
              type: "string",
              description: "Public key for user who can withdraw before deadline",
            },
            afterPublicKey: {
              type: "string",
              description: "Public key for user who can withdraw after deadline",
            },
          },
        },
        DepositResult: {
          type: "object",
          properties: {
            hex: {
              type: "string",
              description: "Transaction in hexadecimal format",
              example: "0200000001...",
            },
            txid: {
              type: "string",
              description: "Transaction ID",
              example: "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
            },
            size: {
              type: "integer",
              description: "Transaction size in bytes",
              example: 350,
            },
            fee: {
              type: "integer",
              description: "Transaction fee in satoshis",
              example: 7000,
            },
            outputs: {
              type: "object",
              properties: {
                escrowAmount: {
                  type: "integer",
                  description: "Amount sent to escrow in satoshis",
                },
                timelockAmount: {
                  type: "integer",
                  description: "Amount sent to timelock in satoshis",
                },
                protocolFeeAmount: {
                  type: "integer",
                  description: "Optional protocol fee amount in satoshis",
                },
                changeAmount: {
                  type: "integer",
                  description: "Optional change amount in satoshis",
                },
                metadata: {
                  type: "string",
                  description: "Optional metadata included in transaction",
                },
              },
            },
          },
        },
        DawnCalculationResult: {
          type: "object",
          properties: {
            totalInputValue: {
              type: "integer",
              description: "Total value of all inputs in satoshis",
            },
            escrowAmount: {
              type: "integer",
              description: "Calculated escrow amount in satoshis",
            },
            timelockAmount: {
              type: "integer",
              description: "Calculated timelock amount in satoshis",
            },
            changeAmount: {
              type: "integer",
              description: "Calculated change amount in satoshis",
            },
            estimatedFee: {
              type: "integer",
              description: "Estimated transaction fee in satoshis",
            },
            protocolFeeAmount: {
              type: "integer",
              description: "Protocol fee amount in satoshis",
            },
            totalRequired: {
              type: "integer",
              description: "Total amount required for the transaction in satoshis",
            },
            feasible: {
              type: "boolean",
              description: "Whether the transaction is feasible with current inputs",
            },
            recommendation: {
              type: "string",
              description: "Recommendation if transaction is not feasible",
            },
          },
        },
      },
    },
  },
  apis: [
    path.join(__dirname, "swagger", "paths", "*.js"),
    path.join(__dirname, "demo", "api-routes.js"),
  ],
};

export default swaggerJsdoc(options);
