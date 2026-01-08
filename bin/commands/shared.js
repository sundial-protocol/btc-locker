/**
 * Shared utilities for CLI commands
 */

import * as bitcoin from "bitcoinjs-lib";
import chalk from "chalk";
import { createBTCLocker } from "../../src/index.js";

/**
 * Initialize BTCLocker instance based on network option
 */
export async function initLocker(options) {
  const network =
    options.network === "mainnet"
      ? bitcoin.networks.bitcoin
      : bitcoin.networks.testnet;
  return await createBTCLocker(network);
}

/**
 * Display results in formatted or JSON format
 */
export function displayResult(data, options, title) {
  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(chalk.green(`\n${title}`));
    console.log(chalk.blue("=".repeat(50)));
    Object.entries(data).forEach(([key, value]) => {
      if (typeof value === "object" && value !== null) {
        console.log(chalk.yellow(`${key}:`));
        Object.entries(value).forEach(([subKey, subValue]) => {
          console.log(`  ${subKey}: ${subValue}`);
        });
      } else {
        console.log(`${key}: ${value}`);
      }
    });
    console.log("");
  }
}