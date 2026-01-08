/**
 * Inspect commands for the BTC Locker CLI
 */

import inquirer from "inquirer";
import chalk from "chalk";
import { initLocker, displayResult } from "./shared.js";
import { ScriptUtils } from "../../src/index.js";
import BitcoinAPI from "../../src/bitcoin-api.js";

/**
 * Setup inspect commands
 */
export function setupInspectCommands(program) {
  const inspectCommand = program.command("inspect").description("Inspection utilities");

  /**
   * Check if timelock has expired
   */
  inspectCommand
    .command("time")
    .description("Check if a timelock has expired")
    .option("-t, --time <timestamp>", "Timelock timestamp to check")
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      const locker = await initLocker(parentOptions);

      let locktime = cmdOptions.time;

      if (!locktime) {
        const answer = await inquirer.prompt([
          {
            type: "input",
            name: "locktime",
            message: "Enter timelock timestamp:",
            validate: (input) =>
              input.match(/^\\d+$/) || "Please enter a Unix timestamp",
          },
        ]);
        locktime = answer.locktime;
      }

      locktime = parseInt(locktime);
      const isExpired = locker.isTimelockExpired(locktime);
      const currentTime = Math.floor(Date.now() / 1000);

      const result = {
        locktime,
        locktime_readable: new Date(locktime * 1000).toISOString(),
        current_time: currentTime,
        current_time_readable: new Date(currentTime * 1000).toISOString(),
        is_expired: isExpired,
        time_until_expiry: isExpired ? 0 : locktime - currentTime,
      };

      displayResult(result, parentOptions, "Timelock Status");

      if (!parentOptions.json) {
        if (isExpired) {
          console.log(
            chalk.green("✅ Timelock has expired - funds can be spent")
          );
        } else {
          console.log(
            chalk.yellow(
              `⏳ Timelock active - ${result.time_until_expiry} seconds remaining`
            )
          );
        }
      }
    });

  /**
   * Inspect address command
   */
  inspectCommand
    .command("address")
    .description("Check address balance and UTXOs")
    .option("-a, --address <address>", "Bitcoin address to check")
    .option(
      "--api <provider>",
      "API provider (mempool|blockstream|blockcypher)",
      "mempool"
    )
    .action(async (cmdOptions) => {
      const parentOptions = program.opts();
      const api = new BitcoinAPI(parentOptions.network, cmdOptions.api);

      let address = cmdOptions.address;

      if (!address) {
        const answer = await inquirer.prompt([
          {
            type: "input",
            name: "address",
            message: "Enter Bitcoin address to check:",
            validate: (input) =>
              ScriptUtils.isValidAddress(input) || "Invalid Bitcoin address",
          },
        ]);
        address = answer.address;
      }

      try {
        console.log(
          chalk.blue(`Checking ${address} on ${parentOptions.network}...`)
        );

        const [addressInfo, utxos, feeEstimates] = await Promise.all([
          api.getAddressInfo(address),
          api.getAddressUtxos(address),
          api.getFeeEstimates(),
        ]);

        const totalBalance =
          addressInfo.chain_stats.funded_txo_sum -
          addressInfo.chain_stats.spent_txo_sum;

        const confirmedBalance = utxos
          .filter((u) => u.status.confirmed)
          .reduce((sum, utxo) => sum + utxo.value, 0);

        const unconfirmedBalance = utxos
          .filter((u) => !u.status.confirmed)
          .reduce((sum, utxo) => sum + utxo.value, 0);

        const result = {
          address,
          network: parentOptions.network,
          balance: {
            total_satoshis: totalBalance,
            confirmed_satoshis: confirmedBalance,
            unconfirmed_satoshis: unconfirmedBalance,
            total_btc: (totalBalance / 100000000).toFixed(8),
            confirmed_btc: (confirmedBalance / 100000000).toFixed(8),
            unconfirmed_btc: (unconfirmedBalance / 100000000).toFixed(8),
          },
          transaction_stats: {
            total_transactions: addressInfo.chain_stats.tx_count,
            funded_transactions: addressInfo.chain_stats.funded_txo_count,
            spent_transactions: addressInfo.chain_stats.spent_txo_count,
          },
          utxos: {
            total: utxos.length,
            confirmed: utxos.filter((u) => u.status.confirmed).length,
            unconfirmed: utxos.filter((u) => !u.status.confirmed).length,
            details: utxos.map((utxo) => ({
              txid: utxo.txid,
              vout: utxo.vout,
              value: utxo.value,
              value_btc: (utxo.value / 100000000).toFixed(8),
              confirmed: utxo.status.confirmed,
              block_height: utxo.status.block_height || null,
              confirmations: utxo.status.confirmed 
                ? (addressInfo.chain_stats.block_height || 0) - (utxo.status.block_height || 0) + 1
                : 0,
            })),
          },
          fee_estimates: feeEstimates,
        };

        displayResult(result, parentOptions, "Address Information");

        if (!parentOptions.json && totalBalance > 0) {
          console.log(
            chalk.green(
              `💰 Total balance: ${result.balance.total_btc} BTC (${result.balance.total_satoshis} sat)`
            )
          );
          if (confirmedBalance !== totalBalance) {
            console.log(
              chalk.yellow(
                `🔄 Confirmed: ${result.balance.confirmed_btc} BTC | Unconfirmed: ${result.balance.unconfirmed_btc} BTC`
              )
            );
          }
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
        if (parentOptions.verbose) {
          console.error(error.stack);
        }
      }
    });
}