/**
 * Scripts commands for the BTC Locker CLI
 */

import inquirer from "inquirer";
import chalk from "chalk";
import { initLocker, displayResult } from "./shared.js";
import { TimeUtils, ScriptUtils } from "../../src/index.js";

/**
 * Setup scripts commands
 */
export function setupScriptsCommands(program) {
  const scriptsCommand = program.command("scripts").description("Build locking scripts");

  /**
   * Create timelock script command
   */
  scriptsCommand
    .command("timelock")
    .description("Create a timelock script")
    .option(
      "-t, --time <time>",
      'Lock time (Unix timestamp or human readable like "1 week")'
    )
    .option("-p, --pubkey <pubkey>", "Public key (hex)")
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
            validate: (input) => {
              if (input.match(/^\\d+$/)) return true;
              if (input.match(/^\\d+\\s*(minute|hour|day|week|month|year)s?$/i))
                return true;
              return 'Please enter a Unix timestamp or duration like "1 week"';
            },
          },
          {
            type: "input",
            name: "publicKey",
            message: "Enter public key (hex):",
            when: () => !publicKey,
            validate: (input) =>
              ScriptUtils.isValidPublicKey(input) || "Invalid public key format",
          },
        ]);

        locktime = locktime || answers.locktime;
        publicKey = publicKey || answers.publicKey;
      }

      // Parse human-readable time
      if (!locktime.match(/^\\d+$/)) {
        const match = locktime.match(
          /^(\\d+)\\s*(minute|hour|day|week|month|year)s?$/i
        );
        if (match) {
          const amount = parseInt(match[1]);
          const unit = match[2].toLowerCase();
          const unitMap = {
            minute: TimeUtils.DURATIONS.MINUTE,
            hour: TimeUtils.DURATIONS.HOUR,
            day: TimeUtils.DURATIONS.DAY,
            week: TimeUtils.DURATIONS.WEEK,
            month: TimeUtils.DURATIONS.MONTH,
            year: TimeUtils.DURATIONS.YEAR,
          };
          const duration = amount * unitMap[unit];
          locktime = TimeUtils.addDuration(duration);
        } else {
          console.error(chalk.red("Invalid time format"));
          return;
        }
      } else {
        locktime = parseInt(locktime);
      }

      try {
        const script = await locker.createTimelockScript(locktime, publicKey);
        script.locktime_readable = new Date(locktime * 1000).toISOString();

        displayResult(script, parentOptions, "Timelock Script Created");

        if (!parentOptions.json) {
          console.log(chalk.yellow(`Send Bitcoin to: ${script.address}`));
          console.log(
            chalk.yellow(`Funds locked until: ${script.locktime_readable}`)
          );
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
    });

  /**
   * Create multisig timelock script command
   */
  scriptsCommand
    .command("multisig")
    .description("Create a multisig timelock script")
    .option("-t, --time <time>", "Lock time (Unix timestamp or human readable)")
    .option("-m, --required <m>", "Required signatures", "2")
    .option("-p, --pubkeys <pubkeys>", "Comma-separated public keys")
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      const locker = await initLocker(parentOptions);

      let locktime = cmdOptions.time;
      let m = parseInt(cmdOptions.required);
      let pubkeys = cmdOptions.pubkeys;

      // Interactive prompts
      if (!locktime || !pubkeys) {
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "locktime",
            message: "Enter locktime:",
            when: () => !locktime,
          },
          {
            type: "input",
            name: "pubkeys",
            message: "Enter public keys (comma-separated):",
            when: () => !pubkeys,
            validate: (input) => {
              const keys = input.split(",").map((k) => k.trim());
              return keys.length >= 2 || "Need at least 2 public keys";
            },
          },
        ]);

        locktime = locktime || answers.locktime;
        pubkeys = pubkeys || answers.pubkeys;
      }

      // Parse inputs
      const publicKeys = pubkeys.split(",").map((k) => k.trim());

      if (!locktime.match(/^\\d+$/)) {
        const match = locktime.match(
          /^(\\d+)\\s*(minute|hour|day|week|month|year)s?$/i
        );
        if (match) {
          const amount = parseInt(match[1]);
          const unit = match[2].toLowerCase();
          const unitMap = {
            minute: TimeUtils.DURATIONS.MINUTE,
            hour: TimeUtils.DURATIONS.HOUR,
            day: TimeUtils.DURATIONS.DAY,
            week: TimeUtils.DURATIONS.WEEK,
            month: TimeUtils.DURATIONS.MONTH,
            year: TimeUtils.DURATIONS.YEAR,
          };
          const duration = amount * unitMap[unit];
          locktime = TimeUtils.addDuration(duration);
        }
      } else {
        locktime = parseInt(locktime);
      }

      try {
        const script = locker.createMultisigTimelockScript(
          locktime,
          m,
          publicKeys
        );
        script.locktime_readable = new Date(locktime * 1000).toISOString();

        displayResult(
          script,
          parentOptions,
          `${m}-of-${publicKeys.length} Multisig Timelock Created`
        );
      } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
    });

  /**
   * Create HODL script command
   */
  scriptsCommand
    .command("hodl")
    .description("Create a HODL script with emergency escape")
    .option("-t, --time <time>", "Lock time")
    .option("-o, --owner <pubkey>", "Owner public key")
    .option("-e, --emergency <pubkey>", "Emergency public key")
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      const locker = await initLocker(parentOptions);

      let locktime = cmdOptions.time;
      let ownerPubKey = cmdOptions.owner;
      let emergencyPubKey = cmdOptions.emergency;

      // Interactive prompts
      if (!locktime || !ownerPubKey || !emergencyPubKey) {
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "locktime",
            message: "Enter locktime:",
            when: () => !locktime,
          },
          {
            type: "input",
            name: "ownerPubKey",
            message: "Enter owner public key:",
            when: () => !ownerPubKey,
            validate: (input) =>
              ScriptUtils.isValidPublicKey(input) || "Invalid public key",
          },
          {
            type: "input",
            name: "emergencyPubKey",
            message: "Enter emergency public key:",
            when: () => !emergencyPubKey,
            validate: (input) =>
              ScriptUtils.isValidPublicKey(input) || "Invalid public key",
          },
        ]);

        locktime = locktime || answers.locktime;
        ownerPubKey = ownerPubKey || answers.ownerPubKey;
        emergencyPubKey = emergencyPubKey || answers.emergencyPubKey;
      }

      // Parse time
      if (!locktime.match(/^\\d+$/)) {
        const match = locktime.match(
          /^(\\d+)\\s*(minute|hour|day|week|month|year)s?$/i
        );
        if (match) {
          const amount = parseInt(match[1]);
          const unit = match[2].toLowerCase();
          const unitMap = {
            minute: TimeUtils.DURATIONS.MINUTE,
            hour: TimeUtils.DURATIONS.HOUR,
            day: TimeUtils.DURATIONS.DAY,
            week: TimeUtils.DURATIONS.WEEK,
            month: TimeUtils.DURATIONS.MONTH,
            year: TimeUtils.DURATIONS.YEAR,
          };
          const duration = amount * unitMap[unit];
          locktime = TimeUtils.addDuration(duration);
        }
      } else {
        locktime = parseInt(locktime);
      }

      try {
        const script = locker.createHodlScript(
          locktime,
          ownerPubKey,
          emergencyPubKey
        );
        script.locktime_readable = new Date(locktime * 1000).toISOString();

        displayResult(script, parentOptions, "HODL Script Created");

        if (!parentOptions.json) {
          console.log(chalk.yellow("Spending Options:"));
          console.log(
            chalk.green(
              "• Normal: Wait until locktime, spend with owner key only"
            )
          );
          console.log(
            chalk.green(
              "• Emergency: Anytime with both owner + emergency signatures"
            )
          );
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
    });
}