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
    
    const displayValue = (value, indent = 0) => {
      const spacing = "  ".repeat(indent);
      
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          console.log(`${spacing}[${index}]:`);
          displayValue(item, indent + 1);
        });
      } else if (typeof value === "object" && value !== null) {
        Object.entries(value).forEach(([subKey, subValue]) => {
          if (typeof subValue === "object" && subValue !== null) {
            console.log(`${spacing}${subKey}:`);
            displayValue(subValue, indent + 1);
          } else {
            console.log(`${spacing}${subKey}: ${subValue}`);
          }
        });
      } else {
        console.log(`${spacing}${value}`);
      }
    };
    
    Object.entries(data).forEach(([key, value]) => {
      if (typeof value === "object" && value !== null) {
        console.log(chalk.yellow(`${key}:`));
        displayValue(value, 1);
      } else {
        console.log(`${key}: ${value}`);
      }
    });
    console.log("");
  }
}