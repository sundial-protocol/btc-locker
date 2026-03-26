/**
 * Utility commands for the BTC Locker CLI
 */

import { displayResult } from "./shared.js";
import { ScriptUtils, TimeUtils } from "@sundial-protocol/btc-locker";

/**
 * Setup utility commands
 */
export function setupUtilCommands(program) {
  const utilsCommand = program.command("utils").description("Utility commands");

  utilsCommand
    .command("validate-key <key>")
    .description("Validate a public or private key")
    .action((key, cmd) => {
      const parentOptions = program.opts();

      const isValidPubKey = ScriptUtils.isValidPublicKey(key);
      const isValidPrivKey = ScriptUtils.isValidPrivateKey(key);

      const result = {
        key: key.substring(0, 20) + "...",
        key_length: key.length,
        is_valid_public_key: isValidPubKey,
        is_valid_private_key: isValidPrivKey,
        key_type: isValidPubKey
          ? "public"
          : isValidPrivKey
          ? "private"
          : "invalid",
      };

      displayResult(result, parentOptions, "Key Validation");
    });

  utilsCommand
    .command("time <input>")
    .description("Convert time formats")
    .action((input, cmd) => {
      const parentOptions = program.opts();

      let result;

      if (input.match(/^\\d+$/)) {
        // Unix timestamp
        const timestamp = parseInt(input);
        result = {
          input,
          input_type: "unix_timestamp",
          readable: new Date(timestamp * 1000).toISOString(),
          is_expired: timestamp < Math.floor(Date.now() / 1000),
        };
      } else {
        // Try to parse as duration
        const match = input.match(
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
          const timestamp = TimeUtils.addDuration(duration);

          result = {
            input,
            input_type: "duration",
            duration_seconds: duration,
            future_timestamp: timestamp,
            future_readable: new Date(timestamp * 1000).toISOString(),
          };
        } else {
          result = { error: "Invalid time format" };
        }
      }

      displayResult(result, parentOptions, "Time Conversion");
    });
}