/**
 * Scripts commands for the BTC Locker CLI
 */

import inquirer from "inquirer";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { initLocker, displayResult } from "./shared.js";
import { ScriptUtils } from "../../dist/esm/index.js";
import { validateLocktime, parseLocktime } from "../locktime.js";

/**
 * Format script data for file output
 */
function formatScriptForFile(data, scriptType) {
  const script = data.script;
  const content = `# BTC Locker ${scriptType} Script
# Generated: ${data.generated_at}
# Network: ${data.network}
# 

Script Address: ${script.address}
Script Type: ${script.type}
Script Hash: ${script.scriptHash || "N/A"}
Redeem Script (Hex): ${script.redeemScript}

${
  scriptType === "Timelock"
    ? `Lock Time: ${script.locktime_readable || new Date(script.locktime * 1000).toISOString()}
Lock Time (Unix): ${script.locktime}

`
    : ""
}${
    scriptType === "Escrow"
      ? `Deadline: ${script.deadline_readable || (script.deadline ? new Date(script.deadline * 1000).toISOString() : "N/A")}
Deadline (Unix): ${script.deadline || "N/A"}

`
      : ""
  }# Send Bitcoin to this address:
# ${script.address}

# To spend from this script later:
# btc-locker tx spend --script ${script.redeemScript}
`;
  return content;
}

/**
 * Handle file output for scripts
 */
function handleScriptOutput(script, scriptType, cmdOptions, parentOptions) {
  if (cmdOptions.output) {
    const outputData = {
      generated_at: new Date().toISOString(),
      network: parentOptions.network,
      script: script,
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
        : formatScriptForFile(outputData, scriptType);

      fs.writeFileSync(cmdOptions.output, outputContent, "utf8");

      console.log(
        chalk.green(`✅ ${scriptType} script saved to: ${cmdOptions.output}`),
      );
      console.log(chalk.yellow(`Network: ${parentOptions.network}`));
    } catch (error) {
      console.error(chalk.red(`Failed to save to file: ${error.message}`));
      console.log(chalk.blue("Displaying output instead:"));
      displayResult(script, parentOptions, `${scriptType} Script Created`);
    }
  } else {
    displayResult(script, parentOptions, `${scriptType} Script Created`);
  }
}

/**
 * Setup scripts commands
 */
export function setupScriptsCommands(program) {
  const scriptsCommand = program
    .command("scripts")
    .description("Build locking scripts")
    .option("-o, --output <file>", "Save output to file")
    .option("--json", "Output in JSON format");

  /**
   * Create timelock script command
   */
  scriptsCommand
    .command("timelock")
    .description("Create a timelock script")
    .option(
      "-t, --time <time>",
      'Lock time (Unix timestamp or human readable like "1 week")',
    )
    .option("-p, --pubkey <pubkey>", "Public key (hex)")
    .option("-o, --output <file>", "Save output to file")
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      const locker = await initLocker(parentOptions);

      let locktime = cmdOptions.time;
      let publicKey = cmdOptions.pubkey;

      // Interactive prompts if options not provided
      if (!locktime || !publicKey) {
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "locktime",
            message:
              'Enter locktime (Unix timestamp or duration like "1 week", "30 days"):',
            when: () => !locktime,
            validate: validateLocktime,
          },
          {
            type: "input",
            name: "publicKey",
            message: "Enter public key (hex):",
            when: () => !publicKey,
            validate: (input) =>
              ScriptUtils.isValidPublicKey(input) ||
              "Invalid public key format",
          },
        ]);

        locktime = locktime || answers.locktime;
        publicKey = publicKey || answers.publicKey;
      }

      // Parse human-readable time
      locktime = parseLocktime(locktime);

      try {
        const script = await locker.createTimelockScript(locktime, publicKey);
        script.locktime_readable = new Date(locktime * 1000).toISOString();

        handleScriptOutput(script, "Timelock", cmdOptions, parentOptions);

        if (!parentOptions.json && !cmdOptions.output) {
          console.log(chalk.yellow(`Send Bitcoin to: ${script.address}`));
          console.log(
            chalk.yellow(`Funds locked until: ${script.locktime_readable}`),
          );
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
    });

  /**
   * Create escrow script command
   */
  scriptsCommand
    .command("escrow")
    .description("Create a time-based escrow script")
    .option(
      "-d, --deadline <time>",
      "Deadline (Unix timestamp or human readable)",
    )
    .option(
      "-b, --before-key <pubkey>",
      "Public key for before-deadline withdrawals",
    )
    .option(
      "-a, --after-key <pubkey>",
      "Public key for after-deadline withdrawals",
    )
    .option("-o, --output <file>", "Save output to file")
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      const locker = await initLocker(parentOptions);

      let deadline = cmdOptions.deadline;
      let beforePublicKey = cmdOptions.beforeKey;
      let afterPublicKey = cmdOptions.afterKey;

      // Interactive prompts if options not provided
      if (!deadline || !beforePublicKey || !afterPublicKey) {
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "deadline",
            message:
              'Enter deadline (Unix timestamp or duration like "1 week", "30 days"):',
            when: () => !deadline,
            validate: validateLocktime,
          },
          {
            type: "input",
            name: "beforePublicKey",
            message: "Enter public key for before-deadline withdrawals (hex):",
            when: () => !beforePublicKey,
            validate: (input) =>
              ScriptUtils.isValidPublicKey(input) ||
              "Invalid public key format",
          },
          {
            type: "input",
            name: "afterPublicKey",
            message: "Enter public key for after-deadline withdrawals (hex):",
            when: () => !afterPublicKey,
            validate: (input) => {
              if (!ScriptUtils.isValidPublicKey(input)) {
                return "Invalid public key format";
              }
              if (beforePublicKey && input === beforePublicKey) {
                return "After-deadline key must be different from before-deadline key";
              }
              return true;
            },
          },
        ]);

        deadline = deadline || answers.deadline;
        beforePublicKey = beforePublicKey || answers.beforePublicKey;
        afterPublicKey = afterPublicKey || answers.afterPublicKey;
      }

      // Validate that keys are different
      if (beforePublicKey === afterPublicKey) {
        console.error(
          chalk.red(
            "Error: Before-deadline and after-deadline public keys must be different",
          ),
        );
        return;
      }

      // Parse human-readable time
      deadline = parseLocktime(deadline);

      try {
        const script = await locker.createEscrowScript(
          deadline,
          beforePublicKey,
          afterPublicKey,
        );
        script.deadline_readable = new Date(deadline * 1000).toISOString();

        handleScriptOutput(script, "Escrow", cmdOptions, parentOptions);

        if (!parentOptions.json && !cmdOptions.output) {
          console.log(chalk.yellow(`Send Bitcoin to: ${script.address}`));
          console.log(chalk.yellow(`Deadline: ${script.deadline_readable}`));
          console.log();
          console.log(chalk.cyan("Withdrawal Options:"));
          console.log(
            chalk.green("• Before deadline: Use before-deadline key only"),
          );
          console.log(
            chalk.green("• After deadline: Use after-deadline key only"),
          );
          console.log();
          console.log(chalk.gray(`Before-deadline key: ${beforePublicKey}`));
          console.log(chalk.gray(`After-deadline key: ${afterPublicKey}`));
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
    });
}
