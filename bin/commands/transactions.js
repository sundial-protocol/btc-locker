/**
 * Transaction commands for the BTC Locker CLI
 */

import * as bitcoin from "bitcoinjs-lib";
import inquirer from "inquirer";
import chalk from "chalk";
import { ScriptUtils, TransactionUtils } from "../../dist/esm/index.js";
import BitcoinAPI from "../../dist/esm/bitcoin-api.js";
import { NETWORKS } from "../../dist/esm/utils/network.js";
import { SUNDIAL_NAMESPACE_XONLY, TAPROOT_LEAF_VERSION } from "../../dist/esm/utils/scripts.js";
import { initLocker, displayResult } from "./shared.js";

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
    .option("--fee <satoshis>", "Fee in satoshis", "1000")
    .option("--dry-run", "Create transaction but don't broadcast")
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      await handleLockCommand(cmdOptions, parentOptions);
    });

  /**
   * Distribute yield back to timelock script command
   */
  txCommand
    .command("distribute")
    .description("Distribute yield or earnings back to a timelock script")
    .option("-f, --from-key <key>", "Private key to send from (hex)")
    .option("-t, --to <address>", "Timelock script address to send yield to")
    .option("-a, --amount <satoshis>", "Amount to distribute in satoshis")
    .option("--fee <satoshis>", "Fee in satoshis", "1000")
    .option("--dry-run", "Create transaction but don't broadcast")
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      await handleDistributeCommand(cmdOptions, parentOptions);
    });

  /**
   * Spend from timelock script command
   */
  txCommand
    .command("spend")
    .description("Spend Bitcoin from a timelock script")
    .option(
      "-k, --private-key <key>",
      "Private key corresponding to the script",
    )
    .option("-s, --script-data <file>", "Path to script data JSON file")
    .option("-u, --utxo <txid:vout:amount>", "UTXO to spend (txid:vout:amount)")
    .option("-t, --to <address>", "Address to send funds to")
    .option("--fee <satoshis>", "Fee in satoshis", "1000")
    .option("--dry-run", "Create transaction but don't broadcast")
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      await handleSpendCommand(cmdOptions, parentOptions);
    });

  /**
   * Spend from escrow script command
   */
  txCommand
    .command("escrow-spend")
    .description(
      "Spend Bitcoin from an escrow script (before or after deadline)",
    )
    .option("-a, --address <address>", "Escrow script address to spend from")
    .option("-r, --redeem-script <script>", "Redeem script in hex")
    .option("-k, --private-key <key>", "Private key for spending")
    .option("-t, --to <address>", "Destination address")
    .option(
      "--after-deadline",
      "Spend after deadline (default: before deadline)",
    )
    .option("--fee <satoshis>", "Fee in satoshis", "1000")
    .option("--dry-run", "Create transaction but don't broadcast")
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      await handleEscrowSpendCommand(cmdOptions, parentOptions);
    });

  /**
   * Dawn Protocol staking command
   */
  txCommand
    .command("dawn-stake")
    .description("Create Dawn Protocol staking transaction")
    .option("-f, --from-key <key>", "Private key to send from (hex)")
    .option("-e, --escrow-address <address>", "Escrow script address")
    .option("--escrow-amount <satoshis>", "Amount to send to escrow (satoshis)")
    .option("-t, --timelock-address <address>", "Timelock script address")
    .option(
      "--timelock-amount <satoshis>",
      "Amount to send to timelock (satoshis)",
    )

    .option("--fee-rate <rate>", "Fee rate in sat/byte", "10")
    .option("--fee-address <address>", "Protocol fee address (optional)")
    .option(
      "--protocol-fee-amount <satoshis>",
      "Protocol fee amount in satoshis (required if fee-address is provided)",
    )
    .option(
      "--metadata <string>",
      "Optional metadata to include in transaction (max 80 bytes)",
    )
    .option("--dry-run", "Create transaction but don't broadcast")
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      await handleDawnStakeCommand(cmdOptions, parentOptions);
    });

  /**
   * Dawn Protocol withdrawal command
   */
  txCommand
    .command("dawn-withdraw")
    .description("Withdraw funds from both escrow and timelock scripts")
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
    .option("--fee <satoshis>", "Fee in satoshis", "2000")
    .option("--fee-address <address>", "Protocol fee address (optional)")
    .option(
      "--protocol-fee-amount <satoshis>",
      "Protocol fee amount in satoshis (required if fee-address is provided)",
    )
    .option("--dry-run", "Create transaction but don't broadcast")
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      await handleDawnWithdrawCommand(cmdOptions, parentOptions);
    });
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
  let feeAmount = parseInt(cmdOptions.fee);

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
    const keyPair = await locker.generateKeyPairFromPrivateKey(fromPrivateKey);
    const fromAddress = keyPair.address;

    console.log(chalk.blue(`Checking balance for ${fromAddress}...`));

    // Get UTXOs for the source address
    const utxos = await api.getAddressUtxos(fromAddress);
    const confirmedUtxos = utxos.filter((u) => u.status.confirmed);

    if (confirmedUtxos.length === 0) {
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
    const totalInputValue = confirmedUtxos.reduce(
      (sum, utxo) => sum + utxo.value,
      0,
    );
    const totalRequired = amount + feeAmount;

    if (totalInputValue < totalRequired) {
      console.log(
        chalk.red(
          `❌ Insufficient funds. Have ${totalInputValue} sat, need ${totalRequired} sat`,
        ),
      );
      return;
    }

    // Calculate change
    const changeAmount = totalInputValue - totalRequired;

    console.log(chalk.blue("Creating locking transaction..."));

    // Create the locking transaction
    const txInputs = confirmedUtxos.map((utxo) => ({
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

    // Add change output if needed
    if (changeAmount > 546) {
      // Dust threshold
      outputs.push({
        address: fromAddress,
        value: changeAmount,
      });
    } else if (changeAmount > 0) {
      // Add dust to fee
      feeAmount += changeAmount;
      console.log(
        chalk.yellow(
          `Adding ${changeAmount} sat dust to fee (total fee: ${feeAmount} sat)`,
        ),
      );
    }

    // Create unsigned funding transaction
    const unsignedPsbt = await locker.createFundingTransaction({
      inputs: txInputs,
      outputs: outputs,
    });

    // Sign the transaction
    const signedTx = await locker.signTransaction(unsignedPsbt, fromPrivateKey);

    // Parse transaction details for display
    const tx = bitcoin.Transaction.fromHex(signedTx);
    const lockingTx = {
      hex: signedTx,
      txid: tx.getId(),
      size: signedTx.length / 2,
      fee: feeAmount, // Use the calculated fee amount
    };

    const result = {
      transaction: {
        hex: lockingTx.hex,
        txid: lockingTx.txid,
        size: lockingTx.size,
        fee: lockingTx.fee,
        fee_rate: (lockingTx.fee / lockingTx.size).toFixed(2),
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
        )} BTC in timelock script with ${feeAmount} sat fee?`,
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
  let memo = cmdOptions.memo;

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
        message: "Enter timelock script address to distribute yield to:",
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
        name: "memo",
        message: "Enter optional memo for this distribution:",
        when: () => !memo,
      },
    ]);

    fromPrivateKey = fromPrivateKey || answers.fromPrivateKey;
    toAddress = toAddress || answers.toAddress;
    amount = amount || parseInt(answers.amount);
    memo = memo || answers.memo;
  }

  try {
    // Generate address from private key to check balance
    const keyPair = await locker.generateKeyPairFromPrivateKey(fromPrivateKey);
    const fromAddress = keyPair.address;

    console.log(chalk.blue(`Checking balance for ${fromAddress}...`));

    // Get UTXOs for the source address
    const utxos = await api.getAddressUtxos(fromAddress);
    const confirmedUtxos = utxos.filter((u) => u.status.confirmed);

    if (confirmedUtxos.length === 0) {
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
    const totalInputValue = confirmedUtxos.reduce(
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

    console.log(chalk.blue("Creating yield distribution transaction..."));

    // Create unsigned distribution transaction
    const txInputs = confirmedUtxos.map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
    }));

    const unsignedPsbt = await locker.distributeYield({
      inputs: txInputs,
      timelockAddress: toAddress,
      amount: amount,
      memo: memo,
    });

    // Sign the transaction
    const signedTx = await locker.signTransaction(unsignedPsbt, fromPrivateKey);

    // Parse transaction details for display
    const tx = bitcoin.Transaction.fromHex(signedTx);
    const distributionResult = {
      hex: signedTx,
      txid: tx.getId(),
      size: signedTx.length / 2,
      fee: 1000, // Use default fee amount
      distribution: {
        amount: amount,
        change: totalInputValue - amount - 1000,
      },
      memo: memo,
    };

    const result = {
      transaction: {
        hex: distributionResult.hex,
        txid: distributionResult.txid,
        size: distributionResult.size,
        fee: distributionResult.fee,
        fee_rate: (distributionResult.fee / distributionResult.size).toFixed(2),
      },
      inputs: {
        count: confirmedUtxos.length,
        total_value: totalInputValue,
        total_btc: TransactionUtils.satoshisToBTC(totalInputValue),
      },
      outputs: {
        timelock_address: toAddress,
        distributed_amount: distributionResult.distribution.amount,
        distributed_btc: TransactionUtils.satoshisToBTC(
          distributionResult.distribution.amount,
        ),
        change_amount: distributionResult.distribution.change,
        change_btc: TransactionUtils.satoshisToBTC(
          distributionResult.distribution.change,
        ),
      },
      memo: distributionResult.memo,
    };

    displayResult(
      result,
      parentOptions,
      "Yield Distribution Transaction Created",
    );

    if (cmdOptions.dryRun) {
      console.log(chalk.yellow("🔍 Dry run - transaction not broadcasted"));
      console.log(chalk.blue(`Transaction hex: ${distributionResult.hex}`));
      return;
    }

    // Ask for confirmation before broadcasting
    const confirmationMessage = memo
      ? `Distribute ${TransactionUtils.satoshisToBTC(
          distributionResult.distribution.amount,
        )} BTC yield to timelock with ${
          distributionResult.fee
        } sat fee?\nMemo: ${memo}`
      : `Distribute ${TransactionUtils.satoshisToBTC(
          distributionResult.distribution.amount,
        )} BTC yield to timelock with ${distributionResult.fee} sat fee?`;

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

    if (memo) {
      console.log(chalk.cyan(`📝 Memo: ${memo}`));
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
  let feeAmount = parseInt(cmdOptions.fee);
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

    if (confirmedUtxos.length === 0) {
      console.log(chalk.yellow("⚠️  No confirmed UTXOs found at this address"));
      return;
    }

    // Calculate total available and output amount
    const totalInputValue = confirmedUtxos.reduce(
      (sum, utxo) => sum + utxo.value,
      0,
    );
    const outputValue = totalInputValue - feeAmount;

    if (outputValue <= 0) {
      console.log(chalk.red("❌ Fee amount exceeds available balance"));
      return;
    }

    console.log(chalk.blue("Creating spending transaction..."));

    // Create unsigned spending transaction
    const txInputs = confirmedUtxos.map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
      scriptPubKey: null, // Will be set by the library
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

    // Parse transaction details for display
    const tx = bitcoin.Transaction.fromHex(signedTx);
    const spendingTx = {
      hex: signedTx,
      txid: tx.getId(),
      size: signedTx.length / 2,
      fee: feeAmount,
    };

    const result = {
      transaction: {
        hex: spendingTx.hex,
        txid: spendingTx.txid,
        size: spendingTx.size,
        fee: spendingTx.fee,
        fee_rate: (spendingTx.fee / spendingTx.size).toFixed(2),
      },
      inputs: {
        count: confirmedUtxos.length,
        total_value: totalInputValue,
        total_btc: TransactionUtils.satoshisToBTC(totalInputValue),
      },
      outputs: {
        destination: destinationAddress,
        value: outputValue,
        value_btc: TransactionUtils.satoshisToBTC(outputValue),
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
        )} BTC with ${feeAmount} sat fee?`,
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

async function handleDawnStakeCommand(cmdOptions, parentOptions) {
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

  let feeRate = parseInt(cmdOptions.feeRate);
  let feeAddress = cmdOptions.feeAddress;
  let protocolFeeAmount = cmdOptions.protocolFeeAmount
    ? parseInt(cmdOptions.protocolFeeAmount)
    : null;
  let metadata = cmdOptions.metadata;

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
          name: "metadata",
          message:
            "Enter optional metadata for transaction (max 80 bytes, press enter to skip):",
          when: () => !metadata,
          validate: (input) => {
            if (!input) return true; // Optional field
            return (
              Buffer.byteLength(input, "utf8") <= 80 ||
              "Metadata must be 80 bytes or less"
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
      metadata = metadata || answers.metadata || undefined;
    }

    // Generate key pair from private key
    const fromKeyPair =
      await locker.generateKeyPairFromPrivateKey(fromPrivateKey);
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

    // Check if we have sufficient funds (using Taproot fee estimation)
    const totalRequired =
      escrowAmount + timelockAmount + (protocolFeeAmount || 0);
    const outputCount =
      2 + (protocolFeeAmount ? 1 : 0) + (changeAddress ? 1 : 0);
    const estimatedFee =
      (11 + txInputs.length * 68 + outputCount * 43 + 20) * feeRate;

    if (totalInputValue < totalRequired + estimatedFee) {
      throw new Error(
        `Insufficient funds. Have: ${totalInputValue} sats, Need: ${totalRequired + estimatedFee} sats (${totalRequired} outputs + ${estimatedFee} network fee)`,
      );
    }

    console.log(chalk.cyan("Creating Dawn staking transaction..."));

    // Calculate optimal amounts
    const calculation = await locker.calculateDawnStakingAmounts({
      inputs: txInputs,
      desiredEscrowAmount: escrowAmount,
      desiredTimelockAmount: timelockAmount,
      includeChange: true, // Always include change to sender's address
      feeRate,
      protocolFeeAmount: protocolFeeAmount || 0,
    });

    if (!calculation.feasible) {
      throw new Error(
        `Transaction not feasible: ${calculation.recommendation}`,
      );
    }

    console.log(chalk.gray("Transaction calculation:"));
    console.log(
      chalk.gray(`  Total input: ${calculation.totalInputValue} sats`),
    );
    console.log(chalk.gray(`  Escrow amount: ${escrowAmount} sats`));
    console.log(chalk.gray(`  Timelock amount: ${timelockAmount} sats`));
    console.log(
      chalk.gray(`  Estimated fee: ${calculation.estimatedFee} sats`),
    );
    console.log(chalk.gray(`  Change: ${calculation.changeAmount} sats`));

    // Create the unsigned Dawn staking transaction
    const unsignedPsbt = await locker.createDawnStakingTransaction({
      inputs: txInputs,
      escrowAddress,
      escrowAmount,
      timelockAddress,
      timelockAmount,
      changeAddress:
        calculation.changeAmount >= 546 ? changeAddress : undefined,
      feeRate,
      feeAddress,
      protocolFeeAmount,
      metadata,
    });

    // Sign the transaction
    const signedTx = await locker.signTransaction(unsignedPsbt, fromPrivateKey);

    // Parse transaction details for display
    const tx = bitcoin.Transaction.fromHex(signedTx);
    const stakingTx = {
      hex: signedTx,
      txid: tx.getId(),
      size: signedTx.length / 2,
      fee: calculation.estimatedFee,
      outputs: {
        escrowAmount,
        timelockAmount,
        changeAmount: calculation.changeAmount,
      },
    };

    // Display transaction details
    const result = {
      transaction: {
        hex: stakingTx.hex,
        txid: stakingTx.txid,
        size: stakingTx.size,
        fee: stakingTx.fee,
        fee_rate: (stakingTx.fee / stakingTx.size).toFixed(2),
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

    displayResult(result, parentOptions, "Dawn Staking Transaction Created");

    if (!parentOptions.json) {
      console.log();
      console.log(chalk.yellow("Output Summary:"));
      console.log(
        chalk.green(
          `  → Escrow: ${TransactionUtils.satoshisToBTC(stakingTx.outputs.escrowAmount)} BTC to ${escrowAddress}`,
        ),
      );
      console.log(
        chalk.green(
          `  → Timelock: ${TransactionUtils.satoshisToBTC(stakingTx.outputs.timelockAmount)} BTC to ${timelockAddress}`,
        ),
      );

      if (protocolFeeAmount && feeAddress) {
        console.log(
          chalk.green(
            `  → Protocol Fee: ${TransactionUtils.satoshisToBTC(protocolFeeAmount)} BTC to ${feeAddress}`,
          ),
        );
      }

      if (stakingTx.outputs.changeAmount > 0) {
        console.log(
          chalk.green(
            `  → Change: ${TransactionUtils.satoshisToBTC(stakingTx.outputs.changeAmount)} BTC to ${changeAddress}`,
          ),
        );
      }

      console.log(
        chalk.cyan(
          `Total Fee: ${TransactionUtils.satoshisToBTC(stakingTx.fee)} BTC (${(stakingTx.fee / stakingTx.size).toFixed(2)} sat/byte)`,
        ),
      );

      if (metadata) {
        console.log(chalk.gray(`📝 Metadata: ${metadata}`));
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

async function handleDawnWithdrawCommand(cmdOptions, parentOptions) {
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
  let feeAmount = parseInt(cmdOptions.fee);
  let feeAddress = cmdOptions.feeAddress;
  let protocolFeeAmount = cmdOptions.protocolFeeAmount
    ? parseInt(cmdOptions.protocolFeeAmount)
    : null;

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
    }

    // Calculate destination address from private key if not provided
    if (!destination) {
      const keyPair = await locker.generateKeyPairFromPrivateKey(privateKey);
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
    const totalFees = feeAmount + (protocolFeeAmount || 0);
    const destinationValue = totalInputValue - totalFees;

    if (destinationValue <= 546) {
      // Dust threshold
      console.log(
        chalk.red(
          "Destination output amount would be below dust threshold after fees",
        ),
      );
      return;
    }

    console.log(chalk.blue("Creating dawn withdrawal transaction..."));
    console.log(
      chalk.gray(
        `  Escrow balance: ${escrowValue} sats (${TransactionUtils.satoshisToBTC(escrowValue)} BTC)`,
      ),
    );
    console.log(
      chalk.gray(
        `  Timelock balance: ${timelockValue} sats (${TransactionUtils.satoshisToBTC(timelockValue)} BTC)`,
      ),
    );
    console.log(
      chalk.gray(
        `  Total input: ${totalInputValue} sats (${TransactionUtils.satoshisToBTC(totalInputValue)} BTC)`,
      ),
    );
    console.log(chalk.gray(`  Network fee: ${feeAmount} sats`));
    if (protocolFeeAmount && feeAddress) {
      console.log(
        chalk.gray(
          `  Protocol fee: ${protocolFeeAmount} sats to ${feeAddress}`,
        ),
      );
    }
    console.log(
      chalk.gray(
        `  Destination output: ${destinationValue} sats (${TransactionUtils.satoshisToBTC(destinationValue)} BTC)`,
      ),
    );

    // Build full ScriptInfo objects from raw redeem script hex
    // These contain the Taproot spend info needed for script-path spending
    const escrowRedeemBuf = Buffer.from(escrowScript, "hex");
    const escrowSpendInfo = ScriptUtils.deriveTaprootSpendInfo(escrowRedeemBuf, network);
    const escrowScriptInfo = {
      redeemScript: escrowScript,
      scriptHash: ScriptUtils.calculateScriptHash(escrowRedeemBuf),
      address: escrowSpendInfo.address,
      outputScript: escrowSpendInfo.outputScript.toString("hex"),
      controlBlock: escrowSpendInfo.controlBlock.toString("hex"),
      internalPubkey: SUNDIAL_NAMESPACE_XONLY.toString("hex"),
      leafVersion: TAPROOT_LEAF_VERSION,
      type: "time-escrow",
      locktime: (() => {
        // Parse locktime from escrow script (OP_IF <push> <timestamp> ...)
        try {
          if (escrowRedeemBuf.length > 5 && escrowRedeemBuf[0] === 0x63) {
            const ts = escrowRedeemBuf.slice(2, 6).readUInt32LE(0);
            return ts;
          }
        } catch {}
        return 0;
      })(),
    };

    const timelockRedeemBuf = Buffer.from(timelockScript, "hex");
    const timelockSpendInfo = ScriptUtils.deriveTaprootSpendInfo(timelockRedeemBuf, network);
    const timelockScriptInfo = {
      redeemScript: timelockScript,
      scriptHash: ScriptUtils.calculateScriptHash(timelockRedeemBuf),
      address: timelockSpendInfo.address,
      outputScript: timelockSpendInfo.outputScript.toString("hex"),
      controlBlock: timelockSpendInfo.controlBlock.toString("hex"),
      internalPubkey: SUNDIAL_NAMESPACE_XONLY.toString("hex"),
      leafVersion: TAPROOT_LEAF_VERSION,
      type: "timelock",
      locktime: (() => {
        // Parse locktime from timelock script (<push 4> <timestamp> ...)
        try {
          if (timelockRedeemBuf.length > 4 && timelockRedeemBuf[0] === 0x04) {
            const ts = timelockRedeemBuf.slice(1, 5).readUInt32LE(0);
            return ts;
          }
        } catch {}
        return 0;
      })(),
    };

    // Prepare inputs for the dawn withdrawal method
    const dawnEscrowInputs =
      confirmedEscrowUtxos.length > 0
        ? confirmedEscrowUtxos.map((utxo) => ({
            txid: utxo.txid,
            vout: utxo.vout,
            value: utxo.value,
          }))
        : [];

    const dawnTimelockInputs =
      confirmedTimelockUtxos.length > 0
        ? confirmedTimelockUtxos.map((utxo) => ({
            txid: utxo.txid,
            vout: utxo.vout,
            value: utxo.value,
          }))
        : [];

    // Create unsigned dawn withdrawal transaction
    const unsignedPsbt = await locker.createDawnWithdrawalTransaction({
      escrowInputs: dawnEscrowInputs,
      escrowAddress: escrowAddress,
      escrowScript: escrowScriptInfo,
      timelockInputs: dawnTimelockInputs,
      timelockAddress: timelockAddress,
      timelockScript: timelockScriptInfo,
      destination: destination,
      feeAmount: feeAmount,
      feeAddress,
      protocolFeeAmount,
    });

    // Sign the transaction with the single private key
    const signedTx = await locker.signTransaction(unsignedPsbt, privateKey);

    // Parse transaction details for display
    const tx = bitcoin.Transaction.fromHex(signedTx);
    const withdrawalResult = {
      hex: signedTx,
      txid: tx.getId(),
      size: signedTx.length / 2,
      fee: feeAmount,
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
        fee_rate: (withdrawalResult.fee / withdrawalResult.size).toFixed(2),
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

    displayResult(result, parentOptions, "Dawn Withdrawal Transaction Created");

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
        message: `Broadcast withdrawal transaction moving ${TransactionUtils.satoshisToBTC(totalInputValue)} BTC to ${destination} with ${feeAmount} sat fee?`,
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(chalk.yellow("Withdrawal cancelled"));
      return;
    }

    console.log(chalk.blue("Broadcasting dawn withdrawal transaction..."));

    // Broadcast the single withdrawal transaction
    try {
      const broadcastResult = await api.broadcastTransaction(
        withdrawalResult.hex,
      );
      console.log(
        chalk.green("Dawn withdrawal transaction broadcasted successfully!"),
      );
      console.log(chalk.blue(`Transaction ID: ${broadcastResult.txid}`));

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
        chalk.red(`Failed to broadcast dawn withdrawal: ${error.message}`),
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
 * Handle escrow spending command
 */
async function handleEscrowSpendCommand(cmdOptions, parentOptions) {
  let {
    address: scriptAddress,
    redeemScript,
    privateKey,
    to: destinationAddress,
    afterDeadline,
    fee: feeAmount = 1000,
    dryRun,
  } = cmdOptions;

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
      ]);

      scriptAddress = scriptAddress || answers.scriptAddress;
      redeemScript = redeemScript || answers.redeemScript;
      privateKey = privateKey || answers.privateKey;
      destinationAddress = destinationAddress || answers.destinationAddress;
      afterDeadline =
        afterDeadline !== undefined ? afterDeadline : answers.afterDeadline;
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

    console.log(chalk.blue("Creating escrow spending transaction..."));

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
    const unsignedPsbt = await locker.createEscrowSpendingTransaction({
      scriptData: scriptInfo,
      utxoTxId: utxo.txid,
      utxoIndex: utxo.vout,
      amount: amount,
      outputAddress: destinationAddress,
      spendAfterDeadline: afterDeadline,
      currentTime: Date.now(),
    });

    // Sign the transaction
    const signedTx = await locker.signTransaction(unsignedPsbt, privateKey, {
      spendAfterDeadline: afterDeadline,
    });

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
        fee: feeAmount,
        fee_rate: (feeAmount / size).toFixed(2),
      },
      inputs: {
        count: 1,
        total_value: amount,
        total_btc: TransactionUtils.satoshisToBTC(amount),
      },
      outputs: {
        destination: destinationAddress,
        value: amount - feeAmount,
        value_btc: TransactionUtils.satoshisToBTC(amount - feeAmount),
      },
      spending_path: afterDeadline ? "After deadline" : "Before deadline",
    };

    displayResult(result, parentOptions, "Escrow Spending Transaction Created");

    // Broadcast if not dry run
    if (!dryRun) {
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: `Broadcast transaction spending ${TransactionUtils.satoshisToBTC(amount)} BTC with ${feeAmount} sat fee?`,
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
