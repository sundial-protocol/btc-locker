/**
 * Base commands for the BTC Locker CLI
 */

import inquirer from "inquirer";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import * as bitcoin from "bitcoinjs-lib";
import { initLocker, displayResult } from "./shared.js";
import { ScriptUtils, TransactionUtils } from "@sundial-protocol/btc-locker";
import BitcoinAPI from "@sundial-protocol/btc-locker/bitcoin-api";

/**
 * Format key pair data for file output
 */
function formatKeyPairForFile(data) {
  const content = `# BTC Locker Key Pair
# Generated: ${data.generated_at}
# Network: ${data.network}
# 
# ⚠️ IMPORTANT: This file contains your private key. Keep it secure and never share it!

Public Key (Hex): ${data.key_pair.publicKey}
Private Key (Hex): ${data.key_pair.privateKey}
Address: ${data.key_pair.address}

# Use this public key for creating scripts:
# btc-locker scripts timelock --pubkey ${data.key_pair.publicKey}

# Use this private key for signing transactions:
# btc-locker tx spend --private-key ${data.key_pair.privateKey}
`;
  return content;
}

/**
 * Setup base commands
 */
export function setupBaseCommands(program) {
  /**
   * Generate key pair command
   */
  program
    .command("keygen")
    .description("Generate a new Bitcoin key pair")
    .option("-o, --output <file>", "Save output to file")
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      await handleKeygenCommand(cmdOptions, parentOptions);
    });

    
  /**
   * Sign a transaction
   */
  program
    .command("sign")
    .description("Sign a partially constructed transaction")
    .option("-h, --hex <hex>", "Transaction hex to sign")
    .option("-k, --private-key <key>", "Private key to sign with")
    .option("-i, --input-index <index>", "Input index to sign", "0")
    .option("-s, --script <script>", "Script for the input being signed")
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      await handleSignCommand(cmdOptions, parentOptions);
    });

  /**
   * Submit transaction command
   */
  program
    .command("submit")
    .description("Submit a transaction to the network")
    .option("-h, --hex <hex>", "Transaction hex to submit")
    .option("-f, --file <file>", "Read transaction hex from file")
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      await handleSubmitCommand(cmdOptions, parentOptions);
    });

  /**
   * Interactive mode - Disabled for now
   */
  //program
  //  .command("interactive")
  //  .alias("i")
  //  .description("Interactive mode for creating scripts")
  //  .action(async () => {
  //    const parentOptions = program.opts();
  //    await handleInteractiveCommand({}, parentOptions);
  //  });
}

async function handleKeygenCommand(cmdOptions, parentOptions) {
  const locker = await initLocker(parentOptions);
  const keyPair = await locker.generateKeyPair();

  // If output file specified, write to file
  if (cmdOptions.output) {
    const outputData = {
      generated_at: new Date().toISOString(),
      network: parentOptions.network,
      key_pair: keyPair,
      warning:
        "⚠️ IMPORTANT: This file contains your private key. Keep it secure and never share it!",
    };

    try {
      // Ensure directory exists
      const outputDir = path.dirname(cmdOptions.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Write to file
      const outputContent = parentOptions.json
        ? JSON.stringify(outputData, null, 2)
        : formatKeyPairForFile(outputData);

      fs.writeFileSync(cmdOptions.output, outputContent, "utf8");

      console.log(chalk.green(`✅ Key pair saved to: ${cmdOptions.output}`));
      console.log(
        chalk.red(
          "⚠️  IMPORTANT: Keep this file secure - it contains your private key!"
        )
      );
      console.log(chalk.yellow(`Network: ${parentOptions.network}`));
    } catch (error) {
      console.error(chalk.red(`Failed to save to file: ${error.message}`));
      console.log(chalk.blue("Displaying output instead:"));
      displayResult(keyPair, parentOptions, "Generated Key Pair");
    }
  } else {
    displayResult(keyPair, parentOptions, "Generated Key Pair");

    if (!parentOptions.json) {
      console.log(
        chalk.red("⚠️  IMPORTANT: Save your private key securely!")
      );
      console.log(chalk.yellow(`Network: ${parentOptions.network}`));
    }
  }
}

// disabled for now
async function handleInteractiveCommand(cmdOptions, parentOptions) {
  console.log(chalk.blue("🔒 BTC Locker Interactive Mode"));
  console.log(chalk.yellow(`Network: ${parentOptions.network}`));
  console.log("");

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "What would you like to do?",
      choices: [
        { name: "Generate new key pair", value: "keygen" },
        { name: "Create timelock script", value: "scripts:timelock" },
        { name: "Lock funds in timelock script", value: "lock" },
        { name: "Distribute yield to timelock script", value: "distribute" },
        { name: "Check timelock status", value: "check" },
        { name: "Check address balance & UTXOs", value: "inspect" },
        { name: "Spend from timelock script", value: "spend" },
        { name: "Sign transaction with private keys", value: "sign" },
        { name: "Submit/broadcast transaction to network", value: "submit" },
        { name: "Exit", value: "exit" },
      ],
    },
  ]);

  if (action === "exit") {
    console.log(chalk.blue("Goodbye! 👋"));
    return;
  }

  // Execute the chosen action
  if (action.startsWith('scripts:')) {
    const subAction = action.split(':')[1];
    console.log(chalk.yellow(`Note: Interactive script commands need to be implemented`));
    console.log(chalk.blue(`Try: btc-locker scripts ${subAction} --help`));
  } else {
    console.log(chalk.yellow(`Note: Interactive command routing needs to be implemented`));
    console.log(chalk.blue(`Try: btc-locker ${action} --help`));
  }
}

async function handleSignCommand(cmdOptions, parentOptions) {
  const locker = await initLocker(parentOptions);
  let txHex = cmdOptions.hex;
  let privateKey = cmdOptions.privateKey;
  const inputIndex = parseInt(cmdOptions.inputIndex);
  let script = cmdOptions.script;

  // Interactive prompts if options not provided
  if (!txHex || !privateKey) {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "txHex",
        message: "Enter transaction hex to sign:",
        when: () => !txHex,
        validate: (input) => input.length > 0 || "Transaction hex required",
      },
      {
        type: "input",
        name: "privateKey",
        message: "Enter private key (hex format):",
        when: () => !privateKey,
        validate: (input) =>
          ScriptUtils.isValidPrivateKey(input) || "Invalid private key",
      },
      {
        type: "input",
        name: "script",
        message: "Enter script for the input being signed (optional):",
        when: () => !script,
      },
    ]);

    txHex = txHex || answers.txHex;
    privateKey = privateKey || answers.privateKey;
    script = script || answers.script;
  }

  try {
    console.log(chalk.blue("Parsing and signing transaction..."));

    const signedTx = await locker.signTransaction(txHex, privateKey);

    let transaction;
    try {
      transaction = bitcoin.Transaction.fromHex(signedTx);
    } catch (parseError) {
      throw new Error(`Invalid transaction hex: ${parseError.message}`);
    }

    console.log(chalk.green(`✅ Transaction parsed successfully`));
    console.log(chalk.blue(`Transaction ID: ${transaction.getId()}`));
    console.log(
      chalk.blue(
        `Inputs: ${transaction.ins.length}, Outputs: ${transaction.outs.length}`
      )
    );

    const result = {
      original_tx: txHex,
      signed_tx: signedTx,
      transaction: {
        txid: transaction.getId(),
        size: transaction.byteLength(),
        inputs: transaction.ins.length,
        outputs: transaction.outs.length,
        locktime: transaction.locktime,
      },
      input_index: inputIndex,
      script_provided: !!script,
    };

    displayResult(result, parentOptions, "Transaction Signing Analysis");

    if (!parentOptions.json) {
      console.log(
        chalk.yellow(
          `⚠️  Note: Manual transaction signing is complex and requires UTXO data.`
        )
      );
      console.log(chalk.blue(`Transaction hex: ${signedTx}`));
      console.log(chalk.blue(`Private key provided for input ${inputIndex}`));
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    if (parentOptions.verbose) {
      console.error(error.stack);
    }
  }
}

async function handleSubmitCommand(cmdOptions, parentOptions) {
  // Create a network object that matches the expected NetworkType structure
  const networkObj = {
    name: parentOptions.network === "mainnet" ? "bitcoin" : parentOptions.network
  };
  const api = new BitcoinAPI(networkObj);
  let txHex = cmdOptions.hex;

  // If file option is provided, read from file
  if (cmdOptions.file) {
    try {
      txHex = fs.readFileSync(cmdOptions.file, 'utf8').trim();
    } catch (error) {
      console.error(chalk.red(`Error reading file: ${error.message}`));
      return;
    }
  }

  // Interactive prompt if transaction hex not provided
  if (!txHex) {
    const answer = await inquirer.prompt([
      {
        type: "input",
        name: "txHex",
        message: "Enter signed transaction hex to broadcast:",
        validate: (input) => input.length > 0 || "Transaction hex required",
      },
    ]);
    txHex = answer.txHex;
  }

  try {
    console.log(chalk.blue("Validating transaction..."));

    // Parse and validate the transaction
    const transaction = bitcoin.Transaction.fromHex(txHex);

    const result = {
      transaction: {
        txid: transaction.getId(),
        size: transaction.byteLength(),
        fee_rate: "Unknown (requires UTXO data)",
        inputs: transaction.ins.length,
        outputs: transaction.outs.length,
        locktime: transaction.locktime,
      },
      outputs_summary: transaction.outs.map((output, index) => ({
        index,
        value: Number(output.value),
        value_btc: TransactionUtils.satoshisToBTC(Number(output.value)),
        script_type: output.script.length > 0 ? "Script" : "Unknown",
      })),
    };

    displayResult(result, parentOptions, "Transaction Validation");

    // Ask for confirmation before broadcasting
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: `Broadcast transaction ${transaction.getId()} to ${
          parentOptions.network
        }?`,
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(chalk.yellow("⏹️  Broadcast cancelled"));
      return;
    }

    console.log(chalk.blue("Broadcasting transaction..."));

    const broadcastResult = await api.broadcastTransaction(txHex);

    console.log(chalk.green("✅ Transaction broadcasted successfully!"));
    console.log(
      chalk.blue(
        `Transaction ID: ${broadcastResult.txid || transaction.getId()}`
      )
    );

    if (parentOptions.network === "testnet") {
      console.log(
        chalk.blue(
          `View on explorer: https://mempool.space/testnet/tx/${transaction.getId()}`
        )
      );
    } else {
      console.log(
        chalk.blue(
          `View on explorer: https://mempool.space/tx/${transaction.getId()}`
        )
      );
    }

    if (!parentOptions.json) {
      console.log(
        chalk.green(
          `✅ Transaction submitted to ${parentOptions.network} network`
        )
      );
      console.log(
        chalk.yellow("⏳ Transaction will appear in the mempool shortly")
      );
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    if (error.response && error.response.data) {
      console.error(
        chalk.red(`API Response: ${JSON.stringify(error.response.data)}`)
      );
    }
    if (parentOptions.verbose) {
      console.error(error.stack);
    }
  }
}