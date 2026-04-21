/**
 * Transaction commands for the BTC Locker CLI
 */

import * as bitcoin from "bitcoinjs-lib";
import inquirer from "inquirer";
import chalk from "chalk";
import {
  KeyUtils,
  ScriptUtils,
  TransactionUtils,
  FeeUtils,
} from "@sundial-protocol/btc-locker";
import BitcoinAPI from "@sundial-protocol/btc-locker/bitcoin-api";
import { NETWORKS } from "@sundial-protocol/btc-locker/utils/network";
import { TxType } from "@sundial-protocol/btc-locker/utils/metadata";
import { initLocker, displayResult } from "./shared.js";
import crypto from "crypto";

/**
 * Setup transaction commands
 */
export function setupTransactionCommands(program) {
  const txCommand = program
    .command("tx")
    .description("Quick transaction submission tools");

  /**
   * Lock funds in timelock script command
   */
  txCommand
    .command("lock")
    .description("Send Bitcoin to a timelock script address")
    .option("-f, --from-key <key>", "Private key to send from (hex)")
    .option("-t, --to <address>", "Timelock script address to send to")
    .option("-a, --amount <satoshis>", "Amount to send in satoshis")
    .option(
      "-p, --priority <level>",
      "Fee priority: high, medium, low",
      "medium",
    )
    .option("--dry-run", "Create transaction but don't broadcast")
    .option(
      "--exclude <txid:vout>",
      "Exclude a UTXO from coin selection, e.g. for inscriptions (repeatable)",
      (v, a) => [...a, v],
      [],
    )
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      await handleLockCommand(cmdOptions, parentOptions);
    });

  /**
   * Distribution command
   */
  txCommand
    .command("distribute")
    .description("Create distribution transaction")
    .option("-f, --from-key <key>", "Private key to send from (hex)")
    .option(
      "-t, --to <address>",
      "Timelock script address to receive distribution",
    )
    .option("-a, --amount <satoshis>", "Amount to distribute in satoshis")
    .option(
      "-p, --priority <level>",
      "Fee priority: high, medium, low",
      "medium",
    )
    .option("--deposit-id <uuid>", "Deposit ID (UUID v4) for Sundial metadata")
    .option("--flags <number>", "Optional 2-byte flags field (default 0)")
    .option("--dry-run", "Create transaction but don't broadcast")
    .option(
      "--exclude <txid:vout>",
      "Exclude a UTXO from coin selection, e.g. for inscriptions (repeatable)",
      (v, a) => [...a, v],
      [],
    )
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      await handleDistributeCommand(cmdOptions, parentOptions);
    });

  /**
   * Spend from timelock script command
   */
  txCommand
    .command("spend")
    .description(
      "Spend Bitcoin from a timelock script (supports both absolute CLTV and relative CSV scripts)",
    )
    .option(
      "-k, --private-key <key>",
      "Private key corresponding to the script",
    )
    .option("-s, --script-data <file>", "Path to script data JSON file")
    .option("-u, --utxo <txid:vout:amount>", "UTXO to spend (txid:vout:amount)")
    .option("-t, --to <address>", "Address to send funds to")
    .option(
      "-p, --priority <level>",
      "Fee priority: high, medium, low",
      "medium",
    )
    .option("--dry-run", "Create transaction but don't broadcast")
    .option(
      "--exclude <txid:vout>",
      "Exclude a UTXO from coin selection, e.g. for inscriptions (repeatable)",
      (v, a) => [...a, v],
      [],
    )
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      await handleSpendCommand(cmdOptions, parentOptions);
    });

  /**
   * Spend from escrow script command
   */
  txCommand
    .command("claim")
    .description("Create claim transaction (spend from escrow script)")
    .option("-a, --address <address>", "Escrow script address to spend from")
    .option("-r, --redeem-script <script>", "Redeem script in hex")
    .option("-k, --private-key <key>", "Private key for spending")
    .option("-t, --to <address>", "Destination address")
    .option(
      "--after-deadline",
      "Spend after deadline (default: before deadline)",
    )
    .option(
      "-p, --priority <level>",
      "Fee priority: high, medium, low",
      "medium",
    )
    .option("--deposit-id <uuid>", "Deposit ID (UUID v4) for Sundial metadata")
    .option(
      "--provider-pubkey <hex>",
      "Yield-provider x-only public key (64 hex chars)",
    )
    .option("--flags <number>", "Optional 2-byte flags field (default 0)")
    .option("--dry-run", "Create transaction but don't broadcast")
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      await handleClaimCommand(cmdOptions, parentOptions);
    });

  /**
   * Deposit command
   */
  txCommand
    .command("deposit")
    .description("Create deposit transaction")
    .option("-f, --from-key <key>", "Private key to send from (hex)")
    .option("-e, --escrow-address <address>", "Escrow script address")
    .option("--escrow-amount <satoshis>", "Amount to send to escrow (satoshis)")
    .option("-t, --timelock-address <address>", "Timelock script address")
    .option(
      "--timelock-amount <satoshis>",
      "Amount to send to timelock (satoshis)",
    )
    .option(
      "-p, --priority <level>",
      "Fee priority: high, medium, low",
      "medium",
    )
    .option("--fee-address <address>", "Protocol fee address (optional)")
    .option(
      "--protocol-fee-amount <satoshis>",
      "Protocol fee amount in satoshis (required if fee-address is provided)",
    )
    .option(
      "--deposit-id <uuid>",
      "Deposit ID (UUID v4); auto-generated if omitted",
    )
    .option(
      "--provider-pubkey <hex>",
      "Yield-provider x-only public key (64 hex chars)",
    )
    .option("--flags <number>", "Optional 2-byte flags field (default 0)")
    .option("--dry-run", "Create transaction but don't broadcast")
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      await handleDepositCommand(cmdOptions, parentOptions);
    });

  /**
   * Withdrawal command
   */
  txCommand
    .command("withdraw")
    .description("Create withdrawal transaction")
    .option(
      "-e, --escrow-address <address>",
      "Escrow script address to withdraw from",
    )
    .option("--escrow-script <script>", "Escrow redeem script (hex)")
    .option(
      "-t, --timelock-address <address>",
      "Timelock script address to withdraw from",
    )
    .option("--timelock-script <script>", "Timelock redeem script (hex)")
    .option("-k, --private-key <key>", "Private key for both scripts (hex)")
    .option(
      "-d, --destination <address>",
      "Destination address for withdrawal (calculated from private key if not provided)",
    )
    .option(
      "-p, --priority <level>",
      "Fee priority: high, medium, low",
      "medium",
    )
    .option("--fee-address <address>", "Protocol fee address (optional)")
    .option(
      "--protocol-fee-amount <satoshis>",
      "Protocol fee amount in satoshis (required if fee-address is provided)",
    )
    .option("--deposit-id <uuid>", "Deposit ID (UUID v4) for Sundial metadata")
    .option(
      "--provider-pubkey <hex>",
      "Yield-provider x-only public key (64 hex chars)",
    )
    .option("--flags <number>", "Optional 2-byte flags field (default 0)")
    .option("--dry-run", "Create transaction but don't broadcast")
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      await handleWithdrawalCommand(cmdOptions, parentOptions);
    });
}

/**
 * Parse actual fee from a signed transaction by comparing inputs vs outputs
 */
function calculateTransactionFee(signedTxHex, inputUtxos) {
  const tx = bitcoin.Transaction.fromHex(signedTxHex);

  // Calculate total input value
  const totalInputValue = inputUtxos.reduce((sum, utxo) => sum + utxo.value, 0);

  // Calculate total output value
  const totalOutputValue = tx.outs.reduce(
    (sum, output) => sum + Number(output.value),
    0,
  );

  // Fee is the difference
  const actualFee = totalInputValue - totalOutputValue;

  return {
    actualFee,
    totalInputValue,
    totalOutputValue,
    feeRate: (actualFee / tx.virtualSize()).toFixed(2),
  };
}

/**
 * Convert priority string to enum value
 */
function parsePriority(priorityStr) {
  const priorityMap = {
    high: "HIGH",
    medium: "MEDIUM",
    low: "LOW",
  };
  return priorityMap[priorityStr.toLowerCase()] || "MEDIUM";
}

async function handleLockCommand(cmdOptions, parentOptions) {
  const locker = await initLocker(parentOptions);

  // Convert 'mainnet' to 'bitcoin' for consistency
  const networkName =
    parentOptions.network === "mainnet" ? "bitcoin" : parentOptions.network;
  const networkType = NETWORKS[networkName];

  if (!networkType) {
    throw new Error(`Unsupported network: ${parentOptions.network}`);
  }

  const api = new BitcoinAPI(networkType);

  // Get network for validation
  const network = networkType.info;

  let fromPrivateKey = cmdOptions.fromKey;
  let toAddress = cmdOptions.to;
  let amount = cmdOptions.amount ? parseInt(cmdOptions.amount) : null;

  // Interactive prompts if options not provided
  if (!fromPrivateKey || !toAddress || !amount) {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "fromPrivateKey",
        message: "Enter private key to send from (hex):",
        when: () => !fromPrivateKey,
        validate: (input) =>
          ScriptUtils.isValidPrivateKey(input) || "Invalid private key",
      },
      {
        type: "input",
        name: "toAddress",
        message: "Enter timelock script address to send to:",
        when: () => !toAddress,
        validate: (input) =>
          ScriptUtils.isValidAddress(input, network) || "Invalid address",
      },
      {
        type: "input",
        name: "amount",
        message: "Enter amount to send (in satoshis):",
        when: () => !amount,
        validate: (input) => {
          const num = parseInt(input);
          return (num > 0 && num < 21000000 * 100000000) || "Invalid amount";
        },
      },
    ]);

    fromPrivateKey = fromPrivateKey || answers.fromPrivateKey;
    toAddress = toAddress || answers.toAddress;
    amount = amount || parseInt(answers.amount);
  }

  try {
    // Generate address from private key to check balance
    const keyPair = await locker.keyPairGenerator.generateKeyPairFromPrivateKey(
      fromPrivateKey,
    );
    const fromAddress = keyPair.address;

    console.log(chalk.blue(`Checking balance for ${fromAddress}...`));

    // Get UTXOs for the source address
    const utxos = await api.getAddressUtxos(fromAddress);
    const confirmedUtxos = utxos.filter((u) => u.status.confirmed);

    const excludedOutpoints = new Set(
      (cmdOptions.exclude || []).map((s) => s.toLowerCase()),
    );
    const spendableUtxos = confirmedUtxos.filter(
      (u) => !excludedOutpoints.has(`${u.txid}:${u.vout}`),
    );
    if (spendableUtxos.length < confirmedUtxos.length) {
      console.log(
        chalk.yellow(
          `⚠️  Excluded ${
            confirmedUtxos.length - spendableUtxos.length
          } UTXO(s) from coin selection`,
        ),
      );
    }

    if (spendableUtxos.length === 0) {
      console.log(
        chalk.yellow("⚠️  No confirmed UTXOs found at source address"),
      );
      if (parentOptions.network === "testnet") {
        console.log(
          chalk.blue(
            "Get testnet coins from: https://coinfaucet.eu/en/btc-testnet/",
          ),
        );
      }
      return;
    }

    // Calculate total available
    const totalInputValue = spendableUtxos.reduce(
      (sum, utxo) => sum + utxo.value,
      0,
    );

    // Check if we have any funds at all
    if (totalInputValue <= amount) {
      console.log(
        chalk.red(
          `❌ Insufficient funds. Have ${totalInputValue} sat, need ${amount} sat + fees`,
        ),
      );
      return;
    }

    console.log(chalk.blue("Creating locking transaction..."));

    // Create the locking transaction
    const txInputs = spendableUtxos.map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
      address: fromAddress,
    }));

    const outputs = [
      {
        address: toAddress,
        value: amount,
      },
    ];

    // Create unsigned funding transaction first to let the system calculate change
    const unsignedPsbt = await locker.createFundingTransaction({
      inputs: txInputs,
      outputs: outputs,
    });

    // Sign the transaction
    const signedTx = await locker.signTransaction(unsignedPsbt, fromPrivateKey);

    // Calculate actual fee and change from the transaction
    const feeInfo = calculateTransactionFee(signedTx, txInputs);
    const changeAmount = feeInfo.totalInputValue - amount - feeInfo.actualFee;

    // Parse transaction details for display
    const tx = bitcoin.Transaction.fromHex(signedTx);
    const lockingTx = {
      hex: signedTx,
      txid: tx.getId(),
      size: signedTx.length / 2,
      fee: feeInfo.actualFee,
      feeRate: feeInfo.feeRate,
    };

    const result = {
      transaction: {
        hex: lockingTx.hex,
        txid: lockingTx.txid,
        size: lockingTx.size,
        fee: lockingTx.fee,
        fee_rate: lockingTx.feeRate,
      },
      inputs: {
        count: confirmedUtxos.length,
        total_value: totalInputValue,
        total_btc: TransactionUtils.satoshisToBTC(totalInputValue),
      },
      outputs: {
        timelock_address: toAddress,
        locked_amount: amount,
        locked_btc: TransactionUtils.satoshisToBTC(amount),
        change_amount: changeAmount > 546 ? changeAmount : 0,
        change_btc:
          changeAmount > 546 ? TransactionUtils.satoshisToBTC(changeAmount) : 0,
      },
    };

    displayResult(result, parentOptions, "Locking Transaction Created");

    if (cmdOptions.dryRun) {
      console.log(chalk.yellow("🔍 Dry run - transaction not broadcasted"));
      console.log(chalk.blue(`Transaction hex: ${lockingTx.hex}`));
      return;
    }

    // Ask for confirmation before broadcasting
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: `Lock ${TransactionUtils.satoshisToBTC(
          amount,
        )} BTC in timelock script with ${lockingTx.fee} sat fee (${
          lockingTx.feeRate
        } sat/byte)?`,
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(chalk.yellow("⏹️  Transaction cancelled"));
      return;
    }

    console.log(chalk.blue("Broadcasting transaction..."));

    // Broadcast the transaction
    const broadcastResult = await api.broadcastTransaction(lockingTx.hex);

    console.log(chalk.green("✅ Funds locked successfully!"));
    console.log(
      chalk.blue(`Transaction ID: ${broadcastResult.txid || lockingTx.txid}`),
    );
    console.log(
      chalk.yellow(
        `Locked ${TransactionUtils.satoshisToBTC(amount)} BTC in: ${toAddress}`,
      ),
    );

    if (parentOptions.network === "testnet") {
      console.log(
        chalk.blue(
          `View on explorer: https://mempool.space/testnet/tx/${lockingTx.txid}`,
        ),
      );
    } else {
      console.log(
        chalk.blue(
          `View on explorer: https://mempool.space/tx/${lockingTx.txid}`,
        ),
      );
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    if (parentOptions.verbose) {
      console.error(error.stack);
    }
  }
}

async function handleDistributeCommand(cmdOptions, parentOptions) {
  const locker = await initLocker(parentOptions);

  // Convert 'mainnet' to 'bitcoin' for consistency
  const networkName =
    parentOptions.network === "mainnet" ? "bitcoin" : parentOptions.network;
  const networkType = NETWORKS[networkName];

  if (!networkType) {
    throw new Error(`Unsupported network: ${parentOptions.network}`);
  }

  const api = new BitcoinAPI(networkType);

  // Get network for validation
  const network = networkType.info;

  let fromPrivateKey = cmdOptions.fromKey;
  let toAddress = cmdOptions.to;
  let amount = cmdOptions.amount ? parseInt(cmdOptions.amount) : null;
  let subjectId = cmdOptions.subjectId;
  const flags = cmdOptions.flags ? parseInt(cmdOptions.flags) : 0;
  const priority = parsePriority(cmdOptions.priority || "medium");

  // Interactive prompts if options not provided
  if (!fromPrivateKey || !toAddress || !amount) {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "fromPrivateKey",
        message: "Enter private key to send yield from (hex):",
        when: () => !fromPrivateKey,
        validate: (input) =>
          ScriptUtils.isValidPrivateKey(input) || "Invalid private key",
      },
      {
        type: "input",
        name: "toAddress",
        message: "Enter timelock script address to send distribution to:",
        when: () => !toAddress,
        validate: (input) =>
          ScriptUtils.isValidAddress(input, network) || "Invalid address",
      },
      {
        type: "input",
        name: "amount",
        message: "Enter amount to distribute (in satoshis):",
        when: () => !amount,
        validate: (input) => {
          const num = parseInt(input);
          return (num > 0 && num < 21000000 * 100000000) || "Invalid amount";
        },
      },
      {
        type: "input",
        name: "subjectId",
        message:
          "Enter deposit ID (UUID v4) for Sundial metadata (press enter to skip):",
        when: () => !subjectId,
        validate: (input) => {
          if (!input) return true;
          return (
            /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
              input,
            ) || "Must be a valid UUID v4"
          );
        },
      },
    ]);

    fromPrivateKey = fromPrivateKey || answers.fromPrivateKey;
    toAddress = toAddress || answers.toAddress;
    amount = amount || parseInt(answers.amount);
    subjectId = subjectId || answers.subjectId || undefined;
  }

  try {
    // Generate address from private key to check balance
    const keyPair = await locker.keyPairGenerator.generateKeyPairFromPrivateKey(
      fromPrivateKey,
    );
    const fromAddress = keyPair.address;

    // Derive provider x-only pubkey from the sender's key (distribute is always called by the provider)
    const providerPubkey = KeyUtils.toXOnly(keyPair.publicKey);
    console.log(chalk.gray(`Provider x-only pubkey: ${providerPubkey}`));

    // Build Sundial metadata if deposit ID is available
    let metadata;
    if (subjectId) {
      metadata = {
        magic: "SNDL",
        version: 1,
        txType: TxType.Distribution,
        subjectId,
        providerXonlyPubkey: providerPubkey,
        flags,
      };
    }

    console.log(chalk.blue(`Checking balance for ${fromAddress}...`));

    // Get UTXOs for the source address
    const utxos = await api.getAddressUtxos(fromAddress);
    const confirmedUtxos = utxos.filter((u) => u.status.confirmed);

    const excludedOutpoints = new Set(
      (cmdOptions.exclude || []).map((s) => s.toLowerCase()),
    );
    const spendableUtxos = confirmedUtxos.filter(
      (u) => !excludedOutpoints.has(`${u.txid}:${u.vout}`),
    );
    if (spendableUtxos.length < confirmedUtxos.length) {
      console.log(
        chalk.yellow(
          `⚠️  Excluded ${
            confirmedUtxos.length - spendableUtxos.length
          } UTXO(s) from coin selection`,
        ),
      );
    }

    if (spendableUtxos.length === 0) {
      console.log(
        chalk.yellow("⚠️  No confirmed UTXOs found at source address"),
      );
      if (parentOptions.network === "testnet") {
        console.log(
          chalk.blue(
            "Get testnet coins from: https://coinfaucet.eu/en/btc-testnet/",
          ),
        );
      }
      return;
    }

    // Calculate total available
    const totalInputValue = spendableUtxos.reduce(
      (sum, utxo) => sum + utxo.value,
      0,
    );
    const totalRequired = amount + 1000; // Use default fee for validation

    if (totalInputValue < totalRequired) {
      console.log(
        chalk.red(
          `❌ Insufficient funds. Have ${totalInputValue} sat, need ${totalRequired} sat`,
        ),
      );
      return;
    }

    console.log(chalk.blue("Creating distribution transaction..."));

    // Create unsigned distribution transaction
    const txInputs = spendableUtxos.map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
    }));

    const unsignedPsbt = await locker.createDistributionTransaction({
      inputs: txInputs,
      sourceAddress: fromAddress,
      timelockAddress: toAddress,
      amount: amount,
      priority: priority,
      metadata: metadata,
    });

    // Sign the transaction
    const signedTx = await locker.signTransaction(unsignedPsbt, fromPrivateKey);

    // Calculate actual fee from the transaction
    const feeInfo = calculateTransactionFee(signedTx, txInputs);

    // Parse transaction details for display
    const tx = bitcoin.Transaction.fromHex(signedTx);
    const distributionResult = {
      hex: signedTx,
      txid: tx.getId(),
      size: signedTx.length / 2,
      fee: feeInfo.actualFee,
      feeRate: feeInfo.feeRate,
      distribution: {
        amount: amount,
        change: totalInputValue - amount - feeInfo.actualFee,
      },
      metadata: metadata,
    };

    const result = {
      transaction: {
        hex: distributionResult.hex,
        txid: distributionResult.txid,
        size: distributionResult.size,
        fee: distributionResult.fee,
        fee_rate: distributionResult.feeRate,
      },
      inputs: {
        count: confirmedUtxos.length,
        total_value: totalInputValue,
        total_btc: TransactionUtils.satoshisToBTC(totalInputValue),
      },
      outputs: {
        timelock_address: toAddress,
        distribution_amount: distributionResult.distribution.amount,
        distribution_btc: TransactionUtils.satoshisToBTC(
          distributionResult.distribution.amount,
        ),
        change_amount: distributionResult.distribution.change,
        change_btc: TransactionUtils.satoshisToBTC(
          distributionResult.distribution.change,
        ),
      },
      metadata: metadata
        ? {
            type: "Distribution (0x03)",
            subjectId: metadata.subjectId,
            provider: metadata.providerXonlyPubkey,
          }
        : undefined,
    };

    displayResult(result, parentOptions, "Distribution Transaction Created");

    if (cmdOptions.dryRun) {
      console.log(chalk.yellow("🔍 Dry run - transaction not broadcasted"));
      console.log(chalk.blue(`Transaction hex: ${distributionResult.hex}`));
      return;
    }

    // Ask for confirmation before broadcasting
    const confirmationMessage = metadata
      ? `Distribute ${TransactionUtils.satoshisToBTC(
          distributionResult.distribution.amount,
        )} BTC yield to timelock with ${distributionResult.fee} sat fee (${
          distributionResult.feeRate
        } sat/byte)?\nDeposit ID: ${metadata.subjectId}`
      : `Distribute ${TransactionUtils.satoshisToBTC(
          distributionResult.distribution.amount,
        )} BTC yield to timelock with ${distributionResult.fee} sat fee (${
          distributionResult.feeRate
        } sat/byte)?`;

    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: confirmationMessage,
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(chalk.yellow("⏹️  Distribution cancelled"));
      return;
    }

    console.log(chalk.blue("Broadcasting distribution transaction..."));

    // Broadcast the transaction
    const broadcastResult = await api.broadcastTransaction(
      distributionResult.hex,
    );

    console.log(chalk.green("✅ Yield distributed successfully!"));
    console.log(
      chalk.blue(
        `Transaction ID: ${broadcastResult.txid || distributionResult.txid}`,
      ),
    );
    console.log(
      chalk.yellow(
        `Distributed ${TransactionUtils.satoshisToBTC(
          distributionResult.distribution.amount,
        )} BTC yield to: ${toAddress}`,
      ),
    );

    if (metadata) {
      console.log(chalk.gray(`📝 Sundial Metadata:`));
      console.log(chalk.gray(`   Type: Distribution (0x03)`));
      console.log(chalk.gray(`   Deposit ID: ${metadata.subjectId}`));
      console.log(chalk.gray(`   Provider: ${metadata.providerXonlyPubkey}`));
      if (metadata.flags)
        console.log(
          chalk.gray(
            `   Flags: 0x${metadata.flags.toString(16).padStart(4, "0")}`,
          ),
        );
    }

    if (parentOptions.network === "testnet") {
      console.log(
        chalk.blue(
          `View on explorer: https://mempool.space/testnet/tx/${distributionResult.txid}`,
        ),
      );
    } else {
      console.log(
        chalk.blue(
          `View on explorer: https://mempool.space/tx/${distributionResult.txid}`,
        ),
      );
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    if (parentOptions.verbose) {
      console.error(error.stack);
    }
  }
}

async function handleSpendCommand(cmdOptions, parentOptions) {
  const locker = await initLocker(parentOptions);

  // Convert 'mainnet' to 'bitcoin' for consistency
  const networkName =
    parentOptions.network === "mainnet" ? "bitcoin" : parentOptions.network;
  const networkType = NETWORKS[networkName];

  if (!networkType) {
    throw new Error(`Unsupported network: ${parentOptions.network}`);
  }

  const api = new BitcoinAPI(networkType);

  // Get network for validation
  const network = networkType.info;

  let scriptAddress = cmdOptions.address;
  let redeemScript = cmdOptions.script;
  let privateKey = cmdOptions.key;
  let destinationAddress = cmdOptions.to;
  const priority = parsePriority(cmdOptions.priority || "medium");
  let emergencyKey = cmdOptions.emergencyKey;

  // Interactive prompts if options not provided
  if (!scriptAddress || !redeemScript || !privateKey || !destinationAddress) {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "scriptAddress",
        message: "Enter timelock script address to spend from:",
        when: () => !scriptAddress,
        validate: (input) =>
          ScriptUtils.isValidAddress(input, network) || "Invalid address",
      },
      {
        type: "input",
        name: "redeemScript",
        message: "Enter redeem script (hex):",
        when: () => !redeemScript,
        validate: (input) => input.length > 0 || "Redeem script required",
      },
      {
        type: "input",
        name: "privateKey",
        message: "Enter private key (hex):",
        when: () => !privateKey,
        validate: (input) =>
          ScriptUtils.isValidPrivateKey(input) || "Invalid private key",
      },
      {
        type: "input",
        name: "destinationAddress",
        message: "Enter destination address:",
        when: () => !destinationAddress,
        validate: (input) =>
          ScriptUtils.isValidAddress(input, network) || "Invalid address",
      },
      {
        type: "input",
        name: "emergencyKey",
        message: "Enter emergency private key (hex):",
        when: (answers) => answers.needEmergencyKey && !emergencyKey,
        validate: (input) =>
          ScriptUtils.isValidPrivateKey(input) || "Invalid private key",
      },
    ]);

    scriptAddress = scriptAddress || answers.scriptAddress;
    redeemScript = redeemScript || answers.redeemScript;
    privateKey = privateKey || answers.privateKey;
    destinationAddress = destinationAddress || answers.destinationAddress;
    emergencyKey = emergencyKey || answers.emergencyKey;
  }

  try {
    console.log(chalk.blue(`Checking UTXOs for ${scriptAddress}...`));

    // Get UTXOs for the script address
    let utxos;
    try {
      utxos = await api.getAddressUtxos(scriptAddress);
    } catch (apiError) {
      console.error(chalk.red(`Failed to get UTXOs: ${apiError.message}`));
      return;
    }

    if (!utxos || !Array.isArray(utxos)) {
      console.error(chalk.red("Invalid UTXO response from API"));
      return;
    }

    const confirmedUtxos = utxos.filter((u) => u.status && u.status.confirmed);

    const excludedOutpoints = new Set(
      (cmdOptions.exclude || []).map((s) => s.toLowerCase()),
    );
    const spendableUtxos = confirmedUtxos.filter(
      (u) => !excludedOutpoints.has(`${u.txid}:${u.vout}`),
    );
    if (spendableUtxos.length < confirmedUtxos.length) {
      console.log(
        chalk.yellow(
          `⚠️  Excluded ${
            confirmedUtxos.length - spendableUtxos.length
          } UTXO(s) from coin selection`,
        ),
      );
    }

    if (spendableUtxos.length === 0) {
      console.log(chalk.yellow("⚠️  No confirmed UTXOs found at this address"));
      return;
    }

    // Calculate total available
    const totalInputValue = spendableUtxos.reduce(
      (sum, utxo) => sum + utxo.value,
      0,
    );

    console.log(chalk.blue("Creating spending transaction..."));

    // Estimate fee before building the transaction so the output value is correct
    const feeRate = await FeeUtils.queryChainFeeRates(undefined, networkType);
    const inputCount = spendableUtxos.length;
    const feeAmount = FeeUtils.estimateFee(inputCount, 1, feeRate);
    const outputValue = totalInputValue - feeAmount;

    if (outputValue < FeeUtils.DUST_THRESHOLD) {
      console.log(
        chalk.red(
          `❌ Insufficient funds after fees. Have ${totalInputValue} sat, fee ${feeAmount} sat, output would be ${outputValue} sat (below dust threshold)`,
        ),
      );
      return;
    }

    const txInputs = spendableUtxos.map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
      scriptPubKey: null,
    }));

    const txParams = {
      inputs: txInputs,
      outputs: [
        {
          address: destinationAddress,
          value: outputValue,
        },
      ],
      redeemScript,
      privateKeys: emergencyKey ? [privateKey, emergencyKey] : [privateKey],
    };

    const unsignedPsbt = await locker.createSpendingTransaction(txParams);

    // Sign the transaction with appropriate keys
    const privateKeys = emergencyKey ? [privateKey, emergencyKey] : privateKey;
    const signedTx = await locker.signTransaction(unsignedPsbt, privateKeys);

    // Calculate actual fee from the transaction
    const feeInfo = calculateTransactionFee(signedTx, txInputs);
    const actualOutputValue = feeInfo.totalInputValue - feeInfo.actualFee;

    // Parse transaction details for display
    const tx = bitcoin.Transaction.fromHex(signedTx);
    const spendingTx = {
      hex: signedTx,
      txid: tx.getId(),
      size: signedTx.length / 2,
      fee: feeInfo.actualFee,
      feeRate: feeInfo.feeRate,
    };

    const result = {
      transaction: {
        hex: spendingTx.hex,
        txid: spendingTx.txid,
        size: spendingTx.size,
        fee: spendingTx.fee,
        fee_rate: spendingTx.feeRate,
      },
      inputs: {
        count: confirmedUtxos.length,
        total_value: totalInputValue,
        total_btc: TransactionUtils.satoshisToBTC(totalInputValue),
      },
      outputs: {
        destination: destinationAddress,
        value: actualOutputValue,
        value_btc: TransactionUtils.satoshisToBTC(actualOutputValue),
      },
    };

    displayResult(result, parentOptions, "Spending Transaction Created");

    if (cmdOptions.dryRun) {
      console.log(chalk.yellow("🔍 Dry run - transaction not broadcasted"));
      console.log(chalk.blue(`Transaction hex: ${spendingTx.hex}`));
      return;
    }

    // Ask for confirmation before broadcasting
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: `Broadcast transaction spending ${TransactionUtils.satoshisToBTC(
          totalInputValue,
        )} BTC with ${spendingTx.fee} sat fee (${
          spendingTx.feeRate
        } sat/byte)?`,
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(chalk.yellow("⏹️  Transaction cancelled"));
      return;
    }

    console.log(chalk.blue("Broadcasting transaction..."));

    // Broadcast the transaction
    const broadcastResult = await api.broadcastTransaction(spendingTx.hex);

    console.log(chalk.green("✅ Transaction broadcasted successfully!"));
    console.log(
      chalk.blue(`Transaction ID: ${broadcastResult.txid || spendingTx.txid}`),
    );

    if (parentOptions.network === "testnet") {
      console.log(
        chalk.blue(
          `View on explorer: https://mempool.space/testnet/tx/${spendingTx.txid}`,
        ),
      );
    } else {
      console.log(
        chalk.blue(
          `View on explorer: https://mempool.space/tx/${spendingTx.txid}`,
        ),
      );
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    if (parentOptions.verbose) {
      console.error(error.stack);
    }
  }
}

async function handleDepositCommand(cmdOptions, parentOptions) {
  const locker = await initLocker(parentOptions);

  // Convert 'mainnet' to 'bitcoin' for consistency
  const networkName =
    parentOptions.network === "mainnet" ? "bitcoin" : parentOptions.network;
  const networkType = NETWORKS[networkName];

  if (!networkType) {
    throw new Error(`Unsupported network: ${parentOptions.network}`);
  }

  const api = new BitcoinAPI(networkType);

  // Get network for validation
  const network = networkType.info;

  let fromPrivateKey = cmdOptions.fromKey;
  let escrowAddress = cmdOptions.escrowAddress;
  let escrowAmount = cmdOptions.escrowAmount
    ? parseInt(cmdOptions.escrowAmount)
    : null;
  let timelockAddress = cmdOptions.timelockAddress;
  let timelockAmount = cmdOptions.timelockAmount
    ? parseInt(cmdOptions.timelockAmount)
    : null;

  const priority = parsePriority(cmdOptions.priority || "medium");
  let feeAddress = cmdOptions.feeAddress;
  let protocolFeeAmount = cmdOptions.protocolFeeAmount
    ? parseInt(cmdOptions.protocolFeeAmount)
    : null;
  let subjectId = cmdOptions.subjectId;
  let providerPubkey = KeyUtils.toXOnly(cmdOptions.providerPubkey);
  const flags = cmdOptions.flags ? parseInt(cmdOptions.flags) : 0;

  // Validate fee parameters
  if (feeAddress && !protocolFeeAmount) {
    console.error(
      chalk.red(
        "Error: --protocol-fee-amount is required when --fee-address is provided",
      ),
    );
    return;
  }

  if (protocolFeeAmount && !feeAddress) {
    console.error(
      chalk.red(
        "Error: --fee-address is required when --protocol-fee-amount is provided",
      ),
    );
    return;
  }

  try {
    // Interactive prompts if options not provided
    if (
      !fromPrivateKey ||
      !escrowAddress ||
      !escrowAmount ||
      !timelockAddress ||
      !timelockAmount
    ) {
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "fromPrivateKey",
          message: "Enter private key to send from (hex):",
          when: () => !fromPrivateKey,
          validate: (input) =>
            ScriptUtils.isValidPrivateKey(input) || "Invalid private key",
        },
        {
          type: "input",
          name: "escrowAddress",
          message: "Enter escrow script address:",
          when: () => !escrowAddress,
          validate: (input) =>
            ScriptUtils.isValidAddress(input, network) || "Invalid address",
        },
        {
          type: "input",
          name: "escrowAmount",
          message: "Enter amount to send to escrow (satoshis):",
          when: () => !escrowAmount,
          validate: (input) => {
            const amount = parseInt(input);
            return (
              (!isNaN(amount) && amount > 0) ||
              "Amount must be a positive integer"
            );
          },
        },
        {
          type: "input",
          name: "timelockAddress",
          message: "Enter timelock script address:",
          when: () => !timelockAddress,
          validate: (input) =>
            ScriptUtils.isValidAddress(input, network) || "Invalid address",
        },
        {
          type: "input",
          name: "timelockAmount",
          message: "Enter amount to send to timelock (satoshis):",
          when: () => !timelockAmount,
          validate: (input) => {
            const amount = parseInt(input);
            return (
              (!isNaN(amount) && amount > 0) ||
              "Amount must be a positive integer"
            );
          },
        },

        {
          type: "input",
          name: "feeAddress",
          message:
            "Enter protocol fee address (optional, press enter to skip):",
          when: () => !feeAddress,
          validate: (input) =>
            !input ||
            ScriptUtils.isValidAddress(input, network) ||
            "Invalid address",
        },
        {
          type: "input",
          name: "protocolFeeAmount",
          message:
            "Enter protocol fee amount in satoshis (required if fee address provided):",
          when: (answers) =>
            (answers.feeAddress || feeAddress) && !protocolFeeAmount,
          validate: (input) => {
            const amount = parseInt(input);
            return (
              (!isNaN(amount) && amount > 0) ||
              "Amount must be a positive integer"
            );
          },
        },
        {
          type: "input",
          name: "providerPubkey",
          message:
            "Enter yield-provider x-only public key (64 hex chars, press enter to skip):",
          when: () => !providerPubkey,
          validate: (input) => {
            if (!input) return true;
            return (
              /^[0-9a-fA-F]{64}$/.test(input) ||
              "Must be a 64-character hex string (32-byte x-only pubkey)"
            );
          },
        },
        {
          type: "input",
          name: "subjectId",
          message: "Enter deposit ID (UUID v4, press enter to auto-generate):",
          when: () => !subjectId,
          validate: (input) => {
            if (!input) return true;
            return (
              /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
                input,
              ) || "Must be a valid UUID v4"
            );
          },
        },
      ]);

      fromPrivateKey = fromPrivateKey || answers.fromPrivateKey;
      escrowAddress = escrowAddress || answers.escrowAddress;
      escrowAmount = escrowAmount || parseInt(answers.escrowAmount);
      timelockAddress = timelockAddress || answers.timelockAddress;
      timelockAmount = timelockAmount || parseInt(answers.timelockAmount);

      feeAddress = feeAddress || answers.feeAddress || undefined;
      protocolFeeAmount =
        protocolFeeAmount ||
        (answers.protocolFeeAmount
          ? parseInt(answers.protocolFeeAmount)
          : undefined);
      providerPubkey = providerPubkey || answers.providerPubkey || undefined;
      subjectId = subjectId || answers.subjectId || undefined;
    }

    // Auto-generate deposit ID if not provided
    if (!subjectId) {
      subjectId = crypto.randomUUID();
      console.log(chalk.gray(`Auto-generated deposit ID: ${subjectId}`));
    }

    // Build Sundial metadata if provider pubkey is available
    let metadata;
    if (providerPubkey) {
      metadata = {
        magic: "SNDL",
        version: 1,
        txType: TxType.Deposit,
        subjectId,
        providerXonlyPubkey: providerPubkey,
        flags,
      };
    }

    // Generate key pair from private key
    const fromKeyPair =
      await locker.keyPairGenerator.generateKeyPairFromPrivateKey(
        fromPrivateKey,
      );
    const changeAddress = fromKeyPair.address; // Use sender's address for change
    console.log(chalk.yellow(`Sending from address: ${fromKeyPair.address}`));

    // Get UTXOs for the from address
    console.log(chalk.cyan("Fetching UTXOs..."));
    const utxos = await api.getAddressUtxos(fromKeyPair.address);

    if (!utxos || utxos.length === 0) {
      throw new Error(`No UTXOs found for address ${fromKeyPair.address}`);
    }

    // Filter confirmed UTXOs
    const confirmedUtxos = utxos.filter((utxo) => utxo.status?.confirmed);
    if (confirmedUtxos.length === 0) {
      throw new Error("No confirmed UTXOs available");
    }

    console.log(chalk.green(`Found ${confirmedUtxos.length} confirmed UTXOs`));

    // Convert UTXOs to the expected format
    const txInputs = confirmedUtxos.map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
    }));

    const totalInputValue = txInputs.reduce(
      (sum, input) => sum + input.value,
      0,
    );

    // Basic check if we have sufficient funds (detailed fee calculation handled by transaction method)
    const totalRequired =
      escrowAmount + timelockAmount + (protocolFeeAmount || 0);

    if (totalInputValue <= totalRequired) {
      throw new Error(
        `Insufficient funds. Have: ${totalInputValue} sats, Need at least: ${totalRequired} sats + network fees`,
      );
    }

    console.log(chalk.cyan("Creating deposit transaction..."));

    // Create the unsigned deposit transaction (fee calculation handled automatically)
    const unsignedPsbt = await locker.createDepositTransaction({
      inputs: txInputs,
      sourceAddress: changeAddress,
      escrowAddress,
      escrowAmount,
      timelockAddress,
      timelockAmount,
      changeAddress,
      priority: priority,
      feeAddress,
      protocolFeeAmount,
      metadata,
    });

    // Sign the transaction
    const signedTx = await locker.signTransaction(unsignedPsbt, fromPrivateKey);

    // Calculate actual fee from the transaction
    const feeInfo = calculateTransactionFee(signedTx, txInputs);

    // Parse transaction details for display
    const tx = bitcoin.Transaction.fromHex(signedTx);
    const stakingTx = {
      hex: signedTx,
      txid: tx.getId(),
      size: signedTx.length / 2,
      fee: feeInfo.actualFee,
      feeRate: feeInfo.feeRate,
      outputs: {
        escrowAmount,
        timelockAmount,
        changeAmount:
          feeInfo.totalInputValue -
          escrowAmount -
          timelockAmount -
          (protocolFeeAmount || 0) -
          feeInfo.actualFee,
      },
    };

    // Display transaction details
    const result = {
      transaction: {
        hex: stakingTx.hex,
        txid: stakingTx.txid,
        size: stakingTx.size,
        fee: stakingTx.fee,
        fee_rate: stakingTx.feeRate,
      },
      inputs: {
        count: txInputs.length,
        total_value: totalInputValue,
        total_btc: TransactionUtils.satoshisToBTC(totalInputValue),
      },
      outputs: {
        escrow: {
          address: escrowAddress,
          amount: stakingTx.outputs.escrowAmount,
          btc: TransactionUtils.satoshisToBTC(stakingTx.outputs.escrowAmount),
        },
        timelock: {
          address: timelockAddress,
          amount: stakingTx.outputs.timelockAmount,
          btc: TransactionUtils.satoshisToBTC(stakingTx.outputs.timelockAmount),
        },
      },
    };

    if (stakingTx.outputs.changeAmount > 0) {
      result.outputs.change = {
        address: changeAddress,
        amount: stakingTx.outputs.changeAmount,
        btc: TransactionUtils.satoshisToBTC(stakingTx.outputs.changeAmount),
      };
    }

    displayResult(result, parentOptions, "Deposit Transaction Created");

    if (!parentOptions.json) {
      console.log();
      console.log(chalk.yellow("Output Summary:"));
      console.log(
        chalk.green(
          `  → Escrow: ${TransactionUtils.satoshisToBTC(
            stakingTx.outputs.escrowAmount,
          )} BTC to ${escrowAddress}`,
        ),
      );
      console.log(
        chalk.green(
          `  → Timelock: ${TransactionUtils.satoshisToBTC(
            stakingTx.outputs.timelockAmount,
          )} BTC to ${timelockAddress}`,
        ),
      );

      if (protocolFeeAmount && feeAddress) {
        console.log(
          chalk.green(
            `  → Protocol Fee: ${TransactionUtils.satoshisToBTC(
              protocolFeeAmount,
            )} BTC to ${feeAddress}`,
          ),
        );
      }

      if (stakingTx.outputs.changeAmount > 0) {
        console.log(
          chalk.green(
            `  → Change: ${TransactionUtils.satoshisToBTC(
              stakingTx.outputs.changeAmount,
            )} BTC to ${changeAddress}`,
          ),
        );
      }

      console.log(
        chalk.cyan(
          `Total Fee: ${TransactionUtils.satoshisToBTC(stakingTx.fee)} BTC (${(
            stakingTx.fee / stakingTx.size
          ).toFixed(2)} sat/byte)`,
        ),
      );

      if (metadata) {
        console.log(chalk.gray(`📝 Sundial Metadata:`));
        console.log(chalk.gray(`   Type: Deposit (0x01)`));
        console.log(chalk.gray(`   Deposit ID: ${subjectId}`));
        console.log(chalk.gray(`   Provider: ${providerPubkey}`));
        if (flags)
          console.log(
            chalk.gray(`   Flags: 0x${flags.toString(16).padStart(4, "0")}`),
          );
      }
    }

    if (!cmdOptions.dryRun) {
      console.log(chalk.cyan("\nBroadcasting transaction..."));
      const broadcastResult = await api.broadcastTransaction(stakingTx.hex);
      console.log(chalk.green(`✓ Transaction broadcasted successfully!`));
      console.log(chalk.blue(`Transaction ID: ${broadcastResult.txid}`));

      if (parentOptions.network === "testnet") {
        console.log(
          chalk.blue(
            `View on explorer: https://mempool.space/testnet/tx/${broadcastResult.txid}`,
          ),
        );
      } else {
        console.log(
          chalk.blue(
            `View on explorer: https://mempool.space/tx/${broadcastResult.txid}`,
          ),
        );
      }
    } else {
      console.log(chalk.yellow("\nDRY RUN: Transaction not broadcasted"));
      console.log(
        chalk.gray(
          "Use without --dry-run flag to actually send the transaction",
        ),
      );
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    if (parentOptions.verbose) {
      console.error(error.stack);
    }
  }
}

async function handleWithdrawalCommand(cmdOptions, parentOptions) {
  const locker = await initLocker(parentOptions);

  // Convert 'mainnet' to 'bitcoin' for consistency
  const networkName =
    parentOptions.network === "mainnet" ? "bitcoin" : parentOptions.network;
  const networkType = NETWORKS[networkName];

  if (!networkType) {
    throw new Error(`Unsupported network: ${parentOptions.network}`);
  }

  const api = new BitcoinAPI(networkType);

  // Get network for validation
  const network = networkType.info;

  let escrowAddress = cmdOptions.escrowAddress;
  let escrowScript = cmdOptions.escrowScript;
  let timelockAddress = cmdOptions.timelockAddress;
  let timelockScript = cmdOptions.timelockScript;
  let privateKey = cmdOptions.privateKey;
  let destination = cmdOptions.destination;
  const priority = parsePriority(cmdOptions.priority || "medium");
  let feeAddress = cmdOptions.feeAddress;
  let protocolFeeAmount = cmdOptions.protocolFeeAmount
    ? parseInt(cmdOptions.protocolFeeAmount)
    : null;
  let subjectId = cmdOptions.subjectId;
  let providerPubkey = KeyUtils.toXOnly(cmdOptions.providerPubkey);
  const flags = cmdOptions.flags ? parseInt(cmdOptions.flags) : 0;

  // Validate fee parameters
  if (feeAddress && !protocolFeeAmount) {
    console.error(
      chalk.red(
        "Error: --protocol-fee-amount is required when --fee-address is provided",
      ),
    );
    return;
  }

  if (protocolFeeAmount && !feeAddress) {
    console.error(
      chalk.red(
        "Error: --fee-address is required when --protocol-fee-amount is provided",
      ),
    );
    return;
  }

  try {
    // Interactive prompts if options not provided
    if (
      !escrowAddress ||
      !escrowScript ||
      !timelockAddress ||
      !timelockScript ||
      !privateKey
    ) {
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "escrowAddress",
          message: "Enter escrow script address to withdraw from:",
          when: () => !escrowAddress,
          validate: (input) =>
            ScriptUtils.isValidAddress(input, network) || "Invalid address",
        },
        {
          type: "input",
          name: "escrowScript",
          message: "Enter escrow redeem script (hex):",
          when: () => !escrowScript,
          validate: (input) => input.length > 0 || "Redeem script required",
        },
        {
          type: "input",
          name: "timelockAddress",
          message: "Enter timelock script address to withdraw from:",
          when: () => !timelockAddress,
          validate: (input) =>
            ScriptUtils.isValidAddress(input, network) || "Invalid address",
        },
        {
          type: "input",
          name: "timelockScript",
          message: "Enter timelock redeem script (hex):",
          when: () => !timelockScript,
          validate: (input) => input.length > 0 || "Redeem script required",
        },
        {
          type: "input",
          name: "privateKey",
          message: "Enter private key for both scripts (hex):",
          when: () => !privateKey,
          validate: (input) =>
            ScriptUtils.isValidPrivateKey(input) || "Invalid private key",
        },
        {
          type: "input",
          name: "destination",
          message:
            "Enter destination address (press enter to use address derived from private key):",
          when: () => !destination,
          validate: (input) =>
            !input ||
            ScriptUtils.isValidAddress(input, network) ||
            "Invalid address",
        },
        {
          type: "input",
          name: "feeAddress",
          message:
            "Enter protocol fee address (optional, press enter to skip):",
          when: () => !feeAddress,
          validate: (input) =>
            !input ||
            ScriptUtils.isValidAddress(input, network) ||
            "Invalid address",
        },
        {
          type: "input",
          name: "protocolFeeAmount",
          message:
            "Enter protocol fee amount in satoshis (required if fee address provided):",
          when: (answers) =>
            (answers.feeAddress || feeAddress) && !protocolFeeAmount,
          validate: (input) => {
            const amount = parseInt(input);
            return (
              (!isNaN(amount) && amount > 0) ||
              "Amount must be a positive integer"
            );
          },
        },
        {
          type: "input",
          name: "providerPubkey",
          message:
            "Enter yield-provider x-only public key (64 hex chars, press enter to skip):",
          when: () => !providerPubkey,
          validate: (input) => {
            if (!input) return true;
            return (
              /^[0-9a-fA-F]{64}$/.test(input) ||
              "Must be a 64-character hex string (32-byte x-only pubkey)"
            );
          },
        },
        {
          type: "input",
          name: "subjectId",
          message: "Enter deposit ID (UUID v4) for Sundial metadata:",
          when: (answers) => answers.providerPubkey || providerPubkey,
          validate: (input) => {
            if (!input)
              return "Deposit ID is required when provider pubkey is given";
            return (
              /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
                input,
              ) || "Must be a valid UUID v4"
            );
          },
        },
      ]);

      escrowAddress = escrowAddress || answers.escrowAddress;
      escrowScript = escrowScript || answers.escrowScript;
      timelockAddress = timelockAddress || answers.timelockAddress;
      timelockScript = timelockScript || answers.timelockScript;
      privateKey = privateKey || answers.privateKey;
      destination = destination || answers.destination;
      feeAddress = feeAddress || answers.feeAddress || undefined;
      protocolFeeAmount =
        protocolFeeAmount ||
        (answers.protocolFeeAmount
          ? parseInt(answers.protocolFeeAmount)
          : undefined);
      providerPubkey = providerPubkey || answers.providerPubkey || undefined;
      subjectId = subjectId || answers.subjectId || undefined;
    }

    // Build Sundial metadata if provider pubkey and deposit ID are available
    let metadata;
    if (providerPubkey && subjectId) {
      metadata = {
        magic: "SNDL",
        version: 1,
        txType: TxType.Withdrawal,
        subjectId,
        providerXonlyPubkey: providerPubkey,
        flags,
      };
    }

    // Calculate destination address from private key if not provided
    if (!destination) {
      const keyPair =
        await locker.keyPairGenerator.generateKeyPairFromPrivateKey(privateKey);
      destination = keyPair.address;
      console.log(
        chalk.yellow(
          `Using destination address derived from private key: ${destination}`,
        ),
      );
    }

    console.log(
      chalk.blue(`Checking UTXOs for escrow address: ${escrowAddress}...`),
    );

    // Get UTXOs for both addresses
    const escrowUtxos = await api.getAddressUtxos(escrowAddress);
    const confirmedEscrowUtxos = escrowUtxos.filter((u) => u.status?.confirmed);

    console.log(
      chalk.blue(`Checking UTXOs for timelock address: ${timelockAddress}...`),
    );

    const timelockUtxos = await api.getAddressUtxos(timelockAddress);
    const confirmedTimelockUtxos = timelockUtxos.filter(
      (u) => u.status?.confirmed,
    );

    if (
      confirmedEscrowUtxos.length === 0 &&
      confirmedTimelockUtxos.length === 0
    ) {
      console.log(
        chalk.yellow(
          "No confirmed UTXOs found in either escrow or timelock addresses",
        ),
      );
      return;
    }

    // Calculate total available from both sources
    const escrowValue = confirmedEscrowUtxos.reduce(
      (sum, utxo) => sum + utxo.value,
      0,
    );
    const timelockValue = confirmedTimelockUtxos.reduce(
      (sum, utxo) => sum + utxo.value,
      0,
    );
    const totalInputValue = escrowValue + timelockValue;

    // Basic check for sufficient funds (detailed calculation handled by transaction method)
    if (totalInputValue <= (protocolFeeAmount || 0)) {
      console.log(
        chalk.red(
          `Insufficient funds. Have ${totalInputValue} sats, need at least ${
            protocolFeeAmount || 0
          } sats for protocol fees + network fees`,
        ),
      );
      return;
    }

    console.log(chalk.blue("Creating withdrawal transaction..."));
    console.log(
      chalk.gray(
        `  Escrow balance: ${escrowValue} sats (${TransactionUtils.satoshisToBTC(
          escrowValue,
        )} BTC)`,
      ),
    );
    console.log(
      chalk.gray(
        `  Timelock balance: ${timelockValue} sats (${TransactionUtils.satoshisToBTC(
          timelockValue,
        )} BTC)`,
      ),
    );
    console.log(
      chalk.gray(
        `  Total input: ${totalInputValue} sats (${TransactionUtils.satoshisToBTC(
          totalInputValue,
        )} BTC)`,
      ),
    );
    if (protocolFeeAmount && feeAddress) {
      console.log(
        chalk.gray(
          `  Protocol fee: ${protocolFeeAmount} sats to ${feeAddress}`,
        ),
      );
    }

    // Prepare inputs for the withdrawal method
    const escrowInputs =
      confirmedEscrowUtxos.length > 0
        ? confirmedEscrowUtxos.map((utxo) => ({
            txid: utxo.txid,
            vout: utxo.vout,
            value: utxo.value,
            redeemScript: escrowScript,
          }))
        : [];

    const timelockInputs =
      confirmedTimelockUtxos.length > 0
        ? confirmedTimelockUtxos.map((utxo) => ({
            txid: utxo.txid,
            vout: utxo.vout,
            value: utxo.value,
            redeemScript: timelockScript,
          }))
        : [];

    // Create unsigned withdrawal transaction
    const unsignedPsbt = await locker.createWithdrawalTransaction({
      escrowInputs: escrowInputs,
      escrowRedeemScript: escrowScript,
      timelockInputs: timelockInputs,
      timelockRedeemScript: timelockScript,
      destination: destination,
      priority: priority,
      feeAddress,
      protocolFeeAmount,
      metadata,
    });

    // Sign the transaction with the single private key.
    // The user's key is always in the OP_ELSE branch of the escrow script,
    // so spendAfterDeadline must be false to select that branch.
    const signedTx = await locker.signTransaction(unsignedPsbt, privateKey, {
      spendAfterDeadline: false,
    });

    // Calculate actual fees from the transaction
    const allInputs = [...escrowInputs, ...timelockInputs];
    const feeInfo = calculateTransactionFee(signedTx, allInputs);
    const destinationValue =
      feeInfo.totalInputValue - (protocolFeeAmount || 0) - feeInfo.actualFee;

    // Parse transaction details for display
    const tx = bitcoin.Transaction.fromHex(signedTx);
    const withdrawalResult = {
      hex: signedTx,
      txid: tx.getId(),
      size: signedTx.length / 2,
      fee: feeInfo.actualFee,
      feeRate: feeInfo.feeRate,
      inputs: {
        escrowValue,
        timelockValue,
        totalValue: totalInputValue,
      },
      outputs: {
        destination: destination,
        destinationValue: destinationValue,
        protocolFeeAmount: protocolFeeAmount || undefined,
      },
    };

    // Display results
    const result = {
      transaction: {
        hex: withdrawalResult.hex,
        txid: withdrawalResult.txid,
        size: withdrawalResult.size,
        fee: withdrawalResult.fee,
        fee_rate: withdrawalResult.feeRate,
      },
      inputs: {
        escrow: {
          count: confirmedEscrowUtxos.length,
          value: withdrawalResult.inputs.escrowValue,
          value_btc: TransactionUtils.satoshisToBTC(
            withdrawalResult.inputs.escrowValue,
          ),
        },
        timelock: {
          count: confirmedTimelockUtxos.length,
          value: withdrawalResult.inputs.timelockValue,
          value_btc: TransactionUtils.satoshisToBTC(
            withdrawalResult.inputs.timelockValue,
          ),
        },
        total: {
          count: confirmedEscrowUtxos.length + confirmedTimelockUtxos.length,
          value: withdrawalResult.inputs.totalValue,
          value_btc: TransactionUtils.satoshisToBTC(
            withdrawalResult.inputs.totalValue,
          ),
        },
      },
      output: {
        destination: withdrawalResult.outputs.destination,
        value: withdrawalResult.outputs.destinationValue,
        value_btc: TransactionUtils.satoshisToBTC(
          withdrawalResult.outputs.destinationValue,
        ),
      },
    };

    if (protocolFeeAmount && feeAddress) {
      result.protocol_fee = {
        address: feeAddress,
        amount: protocolFeeAmount,
        amount_btc: TransactionUtils.satoshisToBTC(protocolFeeAmount),
      };
    }

    if (metadata) {
      result.sundial_metadata = {
        type: "Withdrawal (0x04)",
        subjectId: metadata.subjectId,
        provider: metadata.providerXonlyPubkey,
      };
    }

    displayResult(result, parentOptions, "Withdrawal Transaction Created");

    if (cmdOptions.dryRun) {
      console.log(chalk.yellow("Dry run - transaction not broadcasted"));
      console.log(chalk.blue(`Transaction hex: ${withdrawalResult.hex}`));
      return;
    }

    // Ask for confirmation before broadcasting
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: `Broadcast withdrawal transaction moving ${TransactionUtils.satoshisToBTC(
          totalInputValue,
        )} BTC to ${destination} with ${withdrawalResult.fee} sat fee (${
          withdrawalResult.feeRate
        } sat/byte)?`,
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(chalk.yellow("Withdrawal cancelled"));
      return;
    }

    console.log(chalk.blue("Broadcasting withdrawal transaction..."));

    // Broadcast the single withdrawal transaction
    try {
      const broadcastResult = await api.broadcastTransaction(
        withdrawalResult.hex,
      );
      console.log(
        chalk.green("Withdrawal transaction broadcast successfully!"),
      );
      console.log(chalk.blue(`Transaction ID: ${broadcastResult.txid}`));

      if (metadata) {
        console.log(chalk.gray(`📝 Sundial Metadata:`));
        console.log(chalk.gray(`   Type: Withdrawal (0x04)`));
        console.log(chalk.gray(`   Deposit ID: ${metadata.subjectId}`));
        console.log(chalk.gray(`   Provider: ${metadata.providerXonlyPubkey}`));
        if (metadata.flags)
          console.log(
            chalk.gray(
              `   Flags: 0x${metadata.flags.toString(16).padStart(4, "0")}`,
            ),
          );
      }

      if (parentOptions.network === "testnet") {
        console.log(
          chalk.blue(
            `View withdrawal: https://mempool.space/testnet/tx/${broadcastResult.txid}`,
          ),
        );
      } else {
        console.log(
          chalk.blue(
            `View withdrawal: https://mempool.space/tx/${broadcastResult.txid}`,
          ),
        );
      }
    } catch (error) {
      console.log(
        chalk.red(`Failed to broadcast withdrawal: ${error.message}`),
      );
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    if (parentOptions.verbose) {
      console.error(error.stack);
    }
  }
}

/**
 * Handle claim command
 */
async function handleClaimCommand(cmdOptions, parentOptions) {
  const {
    address: scriptAddress,
    redeemScript,
    privateKey,
    to: destinationAddress,
    afterDeadline,
    priority: priorityStr = "medium",
    dryRun,
  } = cmdOptions;

  let subjectId = cmdOptions.subjectId;
  let providerPubkey = KeyUtils.toXOnly(cmdOptions.providerPubkey);
  const flags = cmdOptions.flags ? parseInt(cmdOptions.flags) : 0;

  const priority = parsePriority(priorityStr);

  // Convert 'mainnet' to 'bitcoin' for consistency
  const networkName =
    parentOptions.network === "mainnet" ? "bitcoin" : parentOptions.network;
  const networkType = NETWORKS[networkName];

  if (!networkType) {
    throw new Error(`Unsupported network: ${parentOptions.network}`);
  }

  const api = new BitcoinAPI(networkType);
  const locker = await initLocker(parentOptions);

  try {
    // Interactive prompts if options not provided
    if (!scriptAddress || !redeemScript || !privateKey || !destinationAddress) {
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "scriptAddress",
          message: "Enter escrow script address:",
          when: !scriptAddress,
          validate: (input) => {
            try {
              bitcoin.address.toOutputScript(input, locker.network);
              return true;
            } catch {
              return "Invalid Bitcoin address";
            }
          },
        },
        {
          type: "input",
          name: "redeemScript",
          message: "Enter redeem script (hex):",
          when: !redeemScript,
          validate: (input) =>
            /^[0-9a-fA-F]+$/.test(input) || "Invalid hex string",
        },
        {
          type: "input",
          name: "privateKey",
          message: "Enter private key (hex):",
          when: !privateKey,
          validate: (input) =>
            ScriptUtils.isValidPrivateKey(input) || "Invalid private key",
        },
        {
          type: "input",
          name: "destinationAddress",
          message: "Enter destination address:",
          when: !destinationAddress,
          validate: (input) => {
            try {
              bitcoin.address.toOutputScript(input, locker.network);
              return true;
            } catch {
              return "Invalid Bitcoin address";
            }
          },
        },
        {
          type: "confirm",
          name: "afterDeadline",
          message: "Spend after deadline? (No = spend before deadline)",
          default: false,
          when: afterDeadline === undefined,
        },
        {
          type: "input",
          name: "providerPubkey",
          message:
            "Enter yield-provider x-only public key (64 hex chars, press enter to skip):",
          when: () => !providerPubkey,
          validate: (input) => {
            if (!input) return true;
            return (
              /^[0-9a-fA-F]{64}$/.test(input) ||
              "Must be a 64-character hex string (32-byte x-only pubkey)"
            );
          },
        },
        {
          type: "input",
          name: "subjectId",
          message: "Enter deposit ID (UUID v4) for Sundial metadata:",
          when: (answers) => answers.providerPubkey || providerPubkey,
          validate: (input) => {
            if (!input)
              return "Deposit ID is required when provider pubkey is given";
            return (
              /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
                input,
              ) || "Must be a valid UUID v4"
            );
          },
        },
      ]);

      scriptAddress = scriptAddress || answers.scriptAddress;
      redeemScript = redeemScript || answers.redeemScript;
      privateKey = privateKey || answers.privateKey;
      destinationAddress = destinationAddress || answers.destinationAddress;
      afterDeadline =
        afterDeadline !== undefined ? afterDeadline : answers.afterDeadline;
      providerPubkey = providerPubkey || answers.providerPubkey || undefined;
      subjectId = subjectId || answers.subjectId || undefined;
    }

    // Build Sundial metadata if provider pubkey and deposit ID are available
    let metadata;
    if (providerPubkey && subjectId) {
      metadata = {
        magic: "SNDL",
        version: 1,
        txType: TxType.Claim,
        subjectId,
        providerXonlyPubkey: providerPubkey,
        flags,
      };
    }

    console.log(chalk.blue(`Checking UTXOs for ${scriptAddress}...`));

    // Get UTXOs
    let utxos;
    try {
      utxos = await api.getAddressUtxos(scriptAddress);
    } catch (apiError) {
      console.error(chalk.red(`Failed to get UTXOs: ${apiError.message}`));
      return;
    }

    if (!utxos || !Array.isArray(utxos) || utxos.length === 0) {
      console.log(chalk.yellow("⚠️  No UTXOs found at this address"));
      return;
    }

    const confirmedUtxos = utxos.filter((u) => u.status && u.status.confirmed);
    if (confirmedUtxos.length === 0) {
      console.log(chalk.yellow("⚠️  No confirmed UTXOs found at this address"));
      return;
    }

    // Use the first confirmed UTXO
    const utxo = confirmedUtxos[0];
    const amount = utxo.value;

    console.log(chalk.blue("Creating claim transaction..."));

    // Parse script to create ScriptInfo object
    const scriptInfo = {
      redeemScript: redeemScript,
      type: "time-escrow",
      address: scriptAddress,
    };

    // Parse the script to extract locktime and public keys
    try {
      const scriptBuffer = Buffer.from(redeemScript, "hex");
      const ops = bitcoin.script.decompile(scriptBuffer);

      if (ops && ops.length >= 7) {
        // Extract locktime (should be at position 1 after OP_IF)
        if (typeof ops[1] === "number") {
          scriptInfo.locktime = ops[1];
        } else if (Buffer.isBuffer(ops[1])) {
          let locktimeValue = 0;
          for (let i = 0; i < ops[1].length; i++) {
            locktimeValue += ops[1][i] << (8 * i);
          }
          scriptInfo.locktime = locktimeValue;
        }

        // Find public keys in the script
        // Structure: IF <locktime> CHECKLOCKTIMEVERIFY DROP <afterPubKey> CHECKSIG ELSE <beforePubKey> CHECKSIG ENDIF
        for (let i = 0; i < ops.length; i++) {
          if (Buffer.isBuffer(ops[i]) && ops[i].length === 33) {
            // This is a public key (33 bytes)
            if (!scriptInfo.afterPublicKey) {
              // First pubkey found is the after-deadline key
              scriptInfo.afterPublicKey = ops[i].toString("hex");
            } else if (!scriptInfo.beforePublicKey) {
              // Second pubkey found is the before-deadline key
              scriptInfo.beforePublicKey = ops[i].toString("hex");
              break;
            }
          }
        }
      }
    } catch (error) {
      console.warn(
        chalk.yellow("Could not parse script details:", error.message),
      );
    }

    // Create unsigned spending transaction
    const unsignedPsbt = await locker.createClaimTransaction({
      scriptData: scriptInfo,
      utxoTxId: utxo.txid,
      utxoIndex: utxo.vout,
      amount: amount,
      outputAddress: destinationAddress,
      spendAfterDeadline: afterDeadline,
      priority: priority,
      currentTime: Date.now(),
      metadata,
    });

    // Sign the transaction
    const signedTx = await locker.signTransaction(unsignedPsbt, privateKey, {
      spendAfterDeadline: afterDeadline,
    });

    // Calculate actual fee from the transaction
    const inputUtxos = [{ value: amount }];
    const feeInfo = calculateTransactionFee(signedTx, inputUtxos);

    // Calculate transaction details for display
    const tx = bitcoin.Transaction.fromHex(signedTx);
    const txHex = signedTx;
    const txId = tx.getId();
    const size = Math.ceil(txHex.length / 2);

    const result = {
      transaction: {
        hex: txHex,
        txid: txId,
        size: size,
        fee: feeInfo.actualFee,
        fee_rate: feeInfo.feeRate,
      },
      inputs: {
        count: 1,
        total_value: amount,
        total_btc: TransactionUtils.satoshisToBTC(amount),
      },
      outputs: {
        destination: destinationAddress,
        value: amount - feeInfo.actualFee,
        value_btc: TransactionUtils.satoshisToBTC(amount - feeInfo.actualFee),
      },
      spending_path: afterDeadline ? "After deadline" : "Before deadline",
    };

    if (metadata) {
      result.sundial_metadata = {
        type: "Claim (0x02)",
        subjectId: metadata.subjectId,
        provider: metadata.providerXonlyPubkey,
      };
    }

    displayResult(result, parentOptions, "Claim Transaction Created");

    // Broadcast if not dry run
    if (!dryRun) {
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: `Broadcast transaction spending ${TransactionUtils.satoshisToBTC(
            amount,
          )} BTC with ${feeInfo.actualFee} sat fee (${
            feeInfo.feeRate
          } sat/byte)?`,
          default: false,
        },
      ]);

      if (!confirm) {
        console.log(chalk.yellow("Transaction cancelled"));
        return;
      }

      console.log(chalk.blue("Broadcasting transaction..."));

      try {
        const broadcastResult = await api.broadcastTransaction(txHex);
        console.log(chalk.green("Transaction broadcasted successfully!"));
        console.log(chalk.blue(`Transaction ID: ${broadcastResult.txid}`));

        if (metadata) {
          console.log(chalk.gray(`📝 Sundial Metadata:`));
          console.log(chalk.gray(`   Type: Claim (0x02)`));
          console.log(chalk.gray(`   Deposit ID: ${metadata.subjectId}`));
          console.log(
            chalk.gray(`   Provider: ${metadata.providerXonlyPubkey}`),
          );
          if (metadata.flags)
            console.log(
              chalk.gray(
                `   Flags: 0x${metadata.flags.toString(16).padStart(4, "0")}`,
              ),
            );
        }

        if (parentOptions.network === "testnet") {
          console.log(
            chalk.blue(
              `View transaction: https://mempool.space/testnet/tx/${broadcastResult.txid}`,
            ),
          );
        } else {
          console.log(
            chalk.blue(
              `View transaction: https://mempool.space/tx/${broadcastResult.txid}`,
            ),
          );
        }
      } catch (error) {
        console.log(
          chalk.red(`Failed to broadcast transaction: ${error.message}`),
        );
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    if (parentOptions.verbose) {
      console.error(error.stack);
    }
  }
}
