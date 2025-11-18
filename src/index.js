/**
 * Main entry point for BTC Locker library
 */

const BTCLocker = require("./btc-locker");
const {
  TimeUtils,
  ScriptUtils,
  TransactionUtils,
  BTCLockerError,
  ValidationError,
  TimelockError,
} = require("./utils");

module.exports = {
  BTCLocker,
  TimeUtils,
  ScriptUtils,
  TransactionUtils,
  BTCLockerError,
  ValidationError,
  TimelockError,
};
