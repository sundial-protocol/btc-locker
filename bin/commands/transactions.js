/**
 * Transaction commands for the BTC Locker CLI
 */

import * as bitcoin from "bitcoinjs-lib";
import inquirer from "inquirer";
import chalk from "chalk";
import { ScriptUtils, TransactionUtils } from "../../dist/esm/index.js";
import BitcoinAPI from "../../dist/esm/bitcoin-api.js";
import { initLocker, displayResult } from "./shared.js";

/**
 * Setup transaction commands
 */
export function setupTransactionCommands(program) {
  const txCommand = program.command("tx").description("Quick transaction submission tools");

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
    .option("-k, --private-key <key>", "Private key corresponding to the script")
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
   * Dawn Protocol staking command
   */
  txCommand
    .command("dawn-stake")
    .description("Create Dawn Protocol staking transaction")
    .option("-f, --from-key <key>", "Private key to send from (hex)")
    .option("-e, --escrow-address <address>", "Escrow script address")
    .option("--escrow-amount <satoshis>", "Amount to send to escrow (satoshis)")
    .option("-t, --timelock-address <address>", "Timelock script address")
    .option("--timelock-amount <satoshis>", "Amount to send to timelock (satoshis)")
    .option("-c, --change-address <address>", "Change address (optional)")
    .option("--fee-rate <rate>", "Fee rate in sat/byte", "10")
    .option("--dry-run", "Create transaction but don't broadcast")
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      await handleDawnStakeCommand(cmdOptions, parentOptions);
    });
}

async function handleLockCommand(cmdOptions, parentOptions) {
  const locker = await initLocker(parentOptions);
  const api = new BitcoinAPI(parentOptions.network);

  // Get network for validation
  const network = parentOptions.network === "mainnet" 
    ? bitcoin.networks.bitcoin 
    : bitcoin.networks.testnet;

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
    const keyPair = await locker.generateKeyPairFromPrivateKey(
      fromPrivateKey
    );
    const fromAddress = keyPair.address;

    console.log(chalk.blue(`Checking balance for ${fromAddress}...`));

    // Get UTXOs for the source address
    const utxos = await api.getAddressUtxos(fromAddress);
    const confirmedUtxos = utxos.filter((u) => u.status.confirmed);

    if (confirmedUtxos.length === 0) {
      console.log(
        chalk.yellow("⚠️  No confirmed UTXOs found at source address")
      );
      if (parentOptions.network === "testnet") {
        console.log(
          chalk.blue(
            "Get testnet coins from: https://coinfaucet.eu/en/btc-testnet/"
          )
        );
      }
      return;
    }

    // Calculate total available
    const totalInputValue = confirmedUtxos.reduce(
      (sum, utxo) => sum + utxo.value,
      0
    );
    const totalRequired = amount + feeAmount;

    if (totalInputValue < totalRequired) {
      console.log(
        chalk.red(
          `❌ Insufficient funds. Have ${totalInputValue} sat, need ${totalRequired} sat`
        )
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
          `Adding ${changeAmount} sat dust to fee (total fee: ${feeAmount} sat)`
        )
      );
    }

    const lockingTx = locker.createFundingTransaction({
      inputs: txInputs,
      outputs: outputs,
      privateKey: fromPrivateKey,
    });

    const result = {
      transaction: {
        hex: lockingTx.toHex(),
        txid: lockingTx.getId(),
        size: lockingTx.byteLength(),
        fee: feeAmount,
        fee_rate: (feeAmount / lockingTx.byteLength()).toFixed(2),
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
          changeAmount > 546
            ? TransactionUtils.satoshisToBTC(changeAmount)
            : 0,
      },
    };

    displayResult(result, parentOptions, "Locking Transaction Created");

    if (cmdOptions.dryRun) {
      console.log(chalk.yellow("🔍 Dry run - transaction not broadcasted"));
      console.log(chalk.blue(`Transaction hex: ${lockingTx.toHex()}`));
      return;
    }

    // Ask for confirmation before broadcasting
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: `Lock ${TransactionUtils.satoshisToBTC(
          amount
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
    const broadcastResult = await api.broadcastTransaction(lockingTx.toHex());

    console.log(chalk.green("✅ Funds locked successfully!"));
    console.log(
      chalk.blue(
        `Transaction ID: ${broadcastResult.txid || lockingTx.getId()}`
      )
    );
    console.log(
      chalk.yellow(
        `Locked ${TransactionUtils.satoshisToBTC(
          amount
        )} BTC in: ${toAddress}`
      )
    );

    if (parentOptions.network === "testnet") {
      console.log(
        chalk.blue(
          `View on explorer: https://mempool.space/testnet/tx/${lockingTx.getId()}`
        )
      );
    } else {
      console.log(
        chalk.blue(
          `View on explorer: https://mempool.space/tx/${lockingTx.getId()}`
        )
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
    const api = new BitcoinAPI(parentOptions.network);

    // Get network for validation
    const network = parentOptions.network === "mainnet" 
      ? bitcoin.networks.bitcoin 
      : bitcoin.networks.testnet;

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
      const keyPair = await locker.generateKeyPairFromPrivateKey(
        fromPrivateKey
      );
      const fromAddress = keyPair.address;

      console.log(chalk.blue(`Checking balance for ${fromAddress}...`));

      // Get UTXOs for the source address
      const utxos = await api.getAddressUtxos(fromAddress);
      const confirmedUtxos = utxos.filter((u) => u.status.confirmed);

      if (confirmedUtxos.length === 0) {
        console.log(
          chalk.yellow("⚠️  No confirmed UTXOs found at source address")
        );
        if (parentOptions.network === "testnet") {
          console.log(
            chalk.blue(
              "Get testnet coins from: https://coinfaucet.eu/en/btc-testnet/"
            )
          );
        }
        return;
      }

      // Calculate total available
      const totalInputValue = confirmedUtxos.reduce(
        (sum, utxo) => sum + utxo.value,
        0
      );
      const totalRequired = amount + 1000; // Use default fee for validation

      if (totalInputValue < totalRequired) {
        console.log(
          chalk.red(
            `❌ Insufficient funds. Have ${totalInputValue} sat, need ${totalRequired} sat`
          )
        );
        return;
      }

      console.log(chalk.blue("Creating yield distribution transaction..."));

      // Create the distribution transaction using the distributeYield method
      const txInputs = confirmedUtxos.map((utxo) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        value: utxo.value,
      }));

      const distributionResult = await locker.distributeYield({
        inputs: txInputs,
        timelockAddress: toAddress,
        amount: amount,
        privateKey: fromPrivateKey,
        memo: memo,
      });

      const result = {
        transaction: {
          hex: distributionResult.hex,
          txid: distributionResult.txid,
          size: distributionResult.size,
          fee: distributionResult.fee,
          fee_rate: (distributionResult.fee / distributionResult.size).toFixed(
            2
          ),
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
            distributionResult.distribution.amount
          ),
          change_amount: distributionResult.distribution.change,
          change_btc: TransactionUtils.satoshisToBTC(
            distributionResult.distribution.change
          ),
        },
        memo: distributionResult.memo,
      };

      displayResult(
        result,
        parentOptions,
        "Yield Distribution Transaction Created"
      );

      if (cmdOptions.dryRun) {
        console.log(chalk.yellow("🔍 Dry run - transaction not broadcasted"));
        console.log(chalk.blue(`Transaction hex: ${distributionResult.hex}`));
        return;
      }

      // Ask for confirmation before broadcasting
      const confirmationMessage = memo
        ? `Distribute ${TransactionUtils.satoshisToBTC(
            distributionResult.distribution.amount
          )} BTC yield to timelock with ${
            distributionResult.fee
          } sat fee?\nMemo: ${memo}`
        : `Distribute ${TransactionUtils.satoshisToBTC(
            distributionResult.distribution.amount
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
        distributionResult.hex
      );

      console.log(chalk.green("✅ Yield distributed successfully!"));
      console.log(
        chalk.blue(
          `Transaction ID: ${broadcastResult.txid || distributionResult.txid}`
        )
      );
      console.log(
        chalk.yellow(
          `Distributed ${TransactionUtils.satoshisToBTC(
            distributionResult.distribution.amount
          )} BTC yield to: ${toAddress}`
        )
      );

      if (memo) {
        console.log(chalk.cyan(`📝 Memo: ${memo}`));
      }

      if (parentOptions.network === "testnet") {
        console.log(
          chalk.blue(
            `View on explorer: https://mempool.space/testnet/tx/${distributionResult.txid}`
          )
        );
      } else {
        console.log(
          chalk.blue(
            `View on explorer: https://mempool.space/tx/${distributionResult.txid}`
          )
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
  const api = new BitcoinAPI(parentOptions.network);

  // Get network for validation
  const network = parentOptions.network === "mainnet" 
    ? bitcoin.networks.bitcoin 
    : bitcoin.networks.testnet;

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
        type: "confirm",
        name: "needEmergencyKey",
        message: "Is this a HODL script requiring emergency key?",
        when: () => !emergencyKey,
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

    const confirmedUtxos = utxos.filter(
      (u) => u.status && u.status.confirmed
    );

    if (confirmedUtxos.length === 0) {
      console.log(
        chalk.yellow("⚠️  No confirmed UTXOs found at this address")
      );
      return;
    }

    // Calculate total available and output amount
    const totalInputValue = confirmedUtxos.reduce(
      (sum, utxo) => sum + utxo.value,
      0
    );
    const outputValue = totalInputValue - feeAmount;

    if (outputValue <= 0) {
      console.log(chalk.red("❌ Fee amount exceeds available balance"));
      return;
    }

    console.log(chalk.blue("Creating spending transaction..."));

    // Create the spending transaction
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

    const spendingTx = await locker.createSpendingTransaction(txParams);

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
          totalInputValue
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
    const broadcastResult = await api.broadcastTransaction(
      spendingTx.hex
    );

    console.log(chalk.green("✅ Transaction broadcasted successfully!"));
    console.log(
      chalk.blue(
        `Transaction ID: ${broadcastResult.txid || spendingTx.txid}`
      )
    );

    if (parentOptions.network === "testnet") {
      console.log(
        chalk.blue(
          `View on explorer: https://mempool.space/testnet/tx/${spendingTx.txid}`
        )
      );
    } else {
      console.log(
        chalk.blue(
          `View on explorer: https://mempool.space/tx/${spendingTx.txid}`
        )
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
  const api = new BitcoinAPI(parentOptions.network);
  
  // Get network for validation
  const network = parentOptions.network === "mainnet" 
    ? bitcoin.networks.bitcoin 
    : bitcoin.networks.testnet;

  let fromPrivateKey = cmdOptions.fromKey;
  let escrowAddress = cmdOptions.escrowAddress;
  let escrowAmount = cmdOptions.escrowAmount ? parseInt(cmdOptions.escrowAmount) : null;
  let timelockAddress = cmdOptions.timelockAddress;
  let timelockAmount = cmdOptions.timelockAmount ? parseInt(cmdOptions.timelockAmount) : null;
  let changeAddress = cmdOptions.changeAddress;
  let feeRate = parseInt(cmdOptions.feeRate);

  try {
    // Interactive prompts if options not provided
    if (!fromPrivateKey || !escrowAddress || !escrowAmount || !timelockAddress || !timelockAmount) {
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
            return (!isNaN(amount) && amount > 0) || "Amount must be a positive integer";
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
            return (!isNaN(amount) && amount > 0) || "Amount must be a positive integer";
          },
        },
        {
          type: "input",
          name: "changeAddress",
          message: "Enter change address (optional, press enter to skip):",
          when: () => !changeAddress,
          validate: (input) =>
            !input || ScriptUtils.isValidAddress(input, network) || "Invalid address",
        },
      ]);

      fromPrivateKey = fromPrivateKey || answers.fromPrivateKey;
      escrowAddress = escrowAddress || answers.escrowAddress;
      escrowAmount = escrowAmount || parseInt(answers.escrowAmount);
      timelockAddress = timelockAddress || answers.timelockAddress;
      timelockAmount = timelockAmount || parseInt(answers.timelockAmount);
      changeAddress = changeAddress || answers.changeAddress || undefined;
    }

    // Generate key pair from private key
    const fromKeyPair = await locker.generateKeyPairFromPrivateKey(fromPrivateKey);
    console.log(chalk.yellow(`Sending from address: ${fromKeyPair.address}`));

    // Get UTXOs for the from address
    console.log(chalk.cyan("Fetching UTXOs..."));
    const utxos = await api.getAddressUtxos(fromKeyPair.address);
    
    if (!utxos || utxos.length === 0) {
      throw new Error(`No UTXOs found for address ${fromKeyPair.address}`);
    }

    // Filter confirmed UTXOs
    const confirmedUtxos = utxos.filter(utxo => utxo.status?.confirmed);
    if (confirmedUtxos.length === 0) {
      throw new Error("No confirmed UTXOs available");
    }

    console.log(chalk.green(`Found ${confirmedUtxos.length} confirmed UTXOs`));

    // Convert UTXOs to the expected format
    const txInputs = confirmedUtxos.map(utxo => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value
    }));

    const totalInputValue = txInputs.reduce((sum, input) => sum + input.value, 0);

    // Check if we have sufficient funds
    const totalRequired = escrowAmount + timelockAmount;
    const estimatedFee = (10 + txInputs.length * 148 + (changeAddress ? 3 : 2) * 34 + 20) * feeRate;

    if (totalInputValue < totalRequired + estimatedFee) {
      throw new Error(
        `Insufficient funds. Have: ${totalInputValue} sats, Need: ${totalRequired + estimatedFee} sats (${totalRequired} + ${estimatedFee} fee)`
      );
    }

    console.log(chalk.cyan("Creating Dawn staking transaction..."));

    // Calculate optimal amounts
    const calculation = await locker.calculateDawnStakingAmounts({
      inputs: txInputs,
      desiredEscrowAmount: escrowAmount,
      desiredTimelockAmount: timelockAmount,
      includeChange: !!changeAddress,
      feeRate
    });

    if (!calculation.feasible) {
      throw new Error(`Transaction not feasible: ${calculation.recommendation}`);
    }

    console.log(chalk.gray("Transaction calculation:"));
    console.log(chalk.gray(`  Total input: ${calculation.totalInputValue} sats`));
    console.log(chalk.gray(`  Escrow amount: ${escrowAmount} sats`));
    console.log(chalk.gray(`  Timelock amount: ${timelockAmount} sats`));
    console.log(chalk.gray(`  Estimated fee: ${calculation.estimatedFee} sats`));
    console.log(chalk.gray(`  Change: ${calculation.changeAmount} sats`));

    // Create the Dawn staking transaction
    const stakingTx = await locker.createDawnStakingTransaction({
      inputs: txInputs,
      escrowAddress,
      escrowAmount,
      timelockAddress,
      timelockAmount,
      changeAddress: changeAddress && calculation.changeAmount >= 546 ? changeAddress : undefined,
      privateKey: fromPrivateKey,
      feeRate
    });

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
      console.log(chalk.green(`  → Escrow: ${TransactionUtils.satoshisToBTC(stakingTx.outputs.escrowAmount)} BTC to ${escrowAddress}`));
      console.log(chalk.green(`  → Timelock: ${TransactionUtils.satoshisToBTC(stakingTx.outputs.timelockAmount)} BTC to ${timelockAddress}`));
      
      if (stakingTx.outputs.changeAmount > 0) {
        console.log(chalk.green(`  → Change: ${TransactionUtils.satoshisToBTC(stakingTx.outputs.changeAmount)} BTC to ${changeAddress}`));
      }

      console.log(chalk.cyan(`Total Fee: ${TransactionUtils.satoshisToBTC(stakingTx.fee)} BTC (${(stakingTx.fee / stakingTx.size).toFixed(2)} sat/byte)`));
    }

    if (!cmdOptions.dryRun) {
      console.log(chalk.cyan("\nBroadcasting transaction..."));
      const broadcastResult = await api.broadcastTransaction(stakingTx.hex);
      console.log(chalk.green(`✓ Transaction broadcasted successfully!`));
      console.log(chalk.blue(`Transaction ID: ${broadcastResult.txid}`));

      if (parentOptions.network === "testnet") {
        console.log(
          chalk.blue(
            `View on explorer: https://mempool.space/testnet/tx/${broadcastResult.txid}`
          )
        );
      } else {
        console.log(
          chalk.blue(
            `View on explorer: https://mempool.space/tx/${broadcastResult.txid}`
          )
        );
      }
    } else {
      console.log(chalk.yellow("\n⚠️  DRY RUN: Transaction not broadcasted"));
      console.log(chalk.gray("Use without --dry-run flag to actually send the transaction"));
    }

  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    if (parentOptions.verbose) {
      console.error(error.stack);
    }
  }
}
