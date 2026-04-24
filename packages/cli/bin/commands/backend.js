/**
 * Backend integration commands and HTTP client for the Sundial API.
 *
 * HTTP client functions are exported so transaction commands can call them
 * directly after a successful broadcast. The setupBackendCommands function
 * registers read-only query subcommands under `btc-locker backend`.
 */

import chalk from "chalk";
import { displayResult } from "./shared.js";

// ── HTTP client ──────────────────────────────────────────────────────────────

/**
 * Resolve the server base URL from parent options or the BTC_LOCKER_SERVER env var.
 */
function resolveServerUrl(parentOptions) {
  return (
    parentOptions?.serverUrl ||
    process.env.BTC_LOCKER_SERVER ||
    "http://localhost:8080"
  );
}

/**
 * Perform a GET request and return the parsed JSON body.
 * Throws a descriptive Error on non-2xx responses.
 */
export async function getJson(path, serverUrl) {
  const url = `${serverUrl}${path}`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`Could not reach server at ${serverUrl}: ${err.message}`);
  }
  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch (_) {}
    throw new Error(`GET ${url} → ${res.status} ${res.statusText}${body ? `: ${body}` : ""}`);
  }
  return res.json();
}

/**
 * Perform a POST request with a JSON body and return the parsed JSON response.
 * Throws a descriptive Error on non-2xx responses.
 */
export async function postJson(path, body, serverUrl) {
  const url = `${serverUrl}${path}`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Could not reach server at ${serverUrl}: ${err.message}`);
  }
  if (!res.ok) {
    let errBody = "";
    try { errBody = await res.text(); } catch (_) {}
    throw new Error(`POST ${url} → ${res.status} ${res.statusText}${errBody ? `: ${errBody}` : ""}`);
  }
  return res.json();
}

// ── Named endpoint wrappers ──────────────────────────────────────────────────

/**
 * POST /v1/users/deposits/intent
 *
 * @param {object} dto
 * @param {string} dto.user_beneficiary_address
 * @param {string} dto.provider_id
 * @param {string} dto.program_id
 * @param {number} dto.amount_sats
 * @param {number} dto.alpha_bps
 * @param {number} dto.lock_ms
 * @returns {Promise<{deposit_id: string, status: string, psbt_base64: string, network: string}>}
 */
export async function createDepositIntent(dto, serverUrl) {
  return postJson("/v1/users/deposits/intent", dto, serverUrl);
}

/**
 * POST /v1/providers/distributions/intent
 *
 * @param {object} dto
 * @param {string} dto.provider_id
 * @param {string} dto.program_id
 * @param {string} dto.payable_at   ISO-8601 datetime string
 * @param {Array<{deposit_id: string, yield_sats: number, destination_address: string}>} dto.allocations
 * @returns {Promise<{distribution_id: string, status: string, allocations: Array}>}
 */
export async function createDistributionIntent(dto, serverUrl) {
  return postJson("/v1/providers/distributions/intent", dto, serverUrl);
}

/** GET /v1/providers */
export async function getProviders(serverUrl) {
  return getJson("/v1/providers", serverUrl);
}

/** GET /v1/providers/:providerId/claimable */
export async function getProviderClaimable(providerId, serverUrl) {
  return getJson(`/v1/providers/${encodeURIComponent(providerId)}/claimable`, serverUrl);
}

/** GET /v1/providers/:providerId/distributions/due?within_days=N */
export async function getDistributionsDue(providerId, withinDays, serverUrl) {
  const qs = withinDays != null ? `?within_days=${encodeURIComponent(withinDays)}` : "";
  return getJson(`/v1/providers/${encodeURIComponent(providerId)}/distributions/due${qs}`, serverUrl);
}

/** GET /v1/users/deposits/intent/:depositId */
export async function getDepositStatus(depositId, serverUrl) {
  return getJson(`/v1/users/deposits/intent/${encodeURIComponent(depositId)}`, serverUrl);
}

/** GET /v1/users/deposits/intents/:address */
export async function getUserDeposits(address, serverUrl) {
  return getJson(`/v1/users/deposits/intents/${encodeURIComponent(address)}`, serverUrl);
}

/** GET /v1/users/:beneficiary_address/claimable */
export async function getUserClaimable(address, serverUrl) {
  return getJson(`/v1/users/${encodeURIComponent(address)}/claimable`, serverUrl);
}

/**
 * Look up a single program from GET /v1/providers.
 * Returns the program object (with escrow_script / timelock_script), or null if not found.
 */
export async function getProviderProgram(providerId, programId, serverUrl) {
  const providers = await getProviders(serverUrl);
  const provider = providers.find((p) => p.provider_id === providerId);
  if (!provider) return null;
  return provider.programs?.find((p) => p.program_id === programId) ?? null;
}

/** POST /v1/programs – register a new program for a provider */
export async function createProgram(dto, serverUrl) {
  return postJson('/v1/programs', dto, serverUrl);
}

// ── CLI command registration ──────────────────────────────────────────────────

export function setupBackendCommands(program) {
  const backendCmd = program
    .command("backend")
    .description("Query the Sundial API server (providers, deposits, claimable)");

  // ── btc-locker backend providers ─────────────────────────────────────────
  backendCmd
    .command("providers")
    .description("List active providers and their programs")
    .action(async () => {
      const parentOptions = program.opts();
      const serverUrl = resolveServerUrl(parentOptions);
      try {
        const providers = await getProviders(serverUrl);
        if (!providers.length) {
          console.log(chalk.yellow("No active providers found."));
          return;
        }
        if (parentOptions.json) {
          console.log(JSON.stringify(providers, null, 2));
          return;
        }
        console.log(chalk.green(`\nActive Providers (${providers.length})`));
        console.log(chalk.blue("=".repeat(50)));
        for (const p of providers) {
          console.log(chalk.yellow(`${p.name}`));
          console.log(`  provider_id: ${p.provider_id}`);
          if (p.programs?.length) {
            console.log(`  programs:`);
            for (const prog of p.programs) {
              console.log(`    - ${chalk.cyan(prog.name)} (${prog.program_id})`);
              console.log(`        expected_yield: ${prog.expected_yield_bps} bps`);
              console.log(`        min_lock:       ${prog.min_lock_ms} ms`);
              console.log(`        vault_address:  ${prog.program_vault_address}`);
              if (prog.escrow_script)
                console.log(`        escrow_script:  ${prog.escrow_script}`);
              if (prog.timelock_script)
                console.log(`        timelock_script: ${prog.timelock_script}`);
            }
          } else {
            console.log(`  programs: none`);
          }
        }
        console.log("");
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        if (parentOptions.verbose) console.error(err.stack);
        process.exit(1);
      }
    });

  // ── btc-locker backend provider-claimable <providerId> ───────────────────
  backendCmd
    .command("provider-claimable <providerId>")
    .description("List deposits that a provider can claim (status DEPOSIT_CONFIRMED)")
    .action(async (providerId) => {
      const parentOptions = program.opts();
      const serverUrl = resolveServerUrl(parentOptions);
      try {
        const deposits = await getProviderClaimable(providerId, serverUrl);
        if (!deposits.length) {
          console.log(chalk.yellow("No claimable deposits found for this provider."));
          return;
        }
        if (parentOptions.json) {
          console.log(JSON.stringify(deposits, null, 2));
          return;
        }
        console.log(chalk.green(`\nClaimable Deposits for Provider ${providerId} (${deposits.length})`));
        console.log(chalk.blue("=".repeat(60)));
        for (const d of deposits) {
          console.log(chalk.yellow(`Deposit ${d.deposit_id}`));
          console.log(`  program_id:          ${d.program_id}`);
          console.log(`  program_vault:       ${d.program_vault_address}`);
          console.log(`  amount_sats:         ${d.amount_sats}`);
          console.log(`  escrow_amount_sats:  ${d.escrow_amount_sats}`);
          console.log(`  reserve_amount_sats: ${d.reserve_amount_sats}`);
          console.log(`  alpha_bps:           ${d.alpha_bps}`);
          console.log(`  lock_ms:             ${d.lock_ms}`);
          if (d.escrow_script)
            console.log(`  escrow_script:       ${d.escrow_script}`);
          if (d.timelock_script)
            console.log(`  timelock_script:     ${d.timelock_script}`);
        }
        console.log("");
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        if (parentOptions.verbose) console.error(err.stack);
        process.exit(1);
      }
    });

  // ── btc-locker backend distributions-due <providerId> [--within-days N] ──
  backendCmd
    .command("distributions-due <providerId>")
    .description("List deposits due for FINAL distribution (provider-claim confirmed)")
    .option("--within-days <n>", "Only show deposits maturing within N days", "30")
    .action(async (providerId, cmdOptions) => {
      const parentOptions = program.opts();
      const serverUrl = resolveServerUrl(parentOptions);
      try {
        const withinDays = cmdOptions.withinDays != null ? parseInt(cmdOptions.withinDays) : undefined;
        const deposits = await getDistributionsDue(providerId, withinDays, serverUrl);
        if (!deposits.length) {
          console.log(chalk.yellow("No deposits due for distribution."));
          return;
        }
        if (parentOptions.json) {
          console.log(JSON.stringify(deposits, null, 2));
          return;
        }
        console.log(chalk.green(`\nDeposits Due for Distribution (${deposits.length})`));
        console.log(chalk.blue("=".repeat(60)));
        for (const d of deposits) {
          console.log(chalk.yellow(`Deposit ${d.deposit_id}`));
          console.log(`  program_id:             ${d.program_id}`);
          console.log(`  user_beneficiary:       ${d.user_beneficiary_address}`);
          console.log(`  principal_sats:         ${d.principal_sats}`);
          console.log(`  due_at:                 ${d.due_at ?? "immediately"}`);
        }
        console.log("");
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        if (parentOptions.verbose) console.error(err.stack);
        process.exit(1);
      }
    });

  // ── btc-locker backend deposit-status <depositId> ────────────────────────
  backendCmd
    .command("deposit-status <depositId>")
    .description("Get lifecycle status for a single deposit")
    .action(async (depositId) => {
      const parentOptions = program.opts();
      const serverUrl = resolveServerUrl(parentOptions);
      try {
        const deposit = await getDepositStatus(depositId, serverUrl);
        if (parentOptions.json) {
          console.log(JSON.stringify(deposit, null, 2));
          return;
        }
        displayResult(deposit, parentOptions, `Deposit ${depositId}`);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        if (parentOptions.verbose) console.error(err.stack);
        process.exit(1);
      }
    });

  // ── btc-locker backend user-deposits <address> ───────────────────────────
  backendCmd
    .command("user-deposits <address>")
    .description("List all deposits for a beneficiary address")
    .action(async (address) => {
      const parentOptions = program.opts();
      const serverUrl = resolveServerUrl(parentOptions);
      try {
        const deposits = await getUserDeposits(address, serverUrl);
        if (!deposits.length) {
          console.log(chalk.yellow("No deposits found for this address."));
          return;
        }
        if (parentOptions.json) {
          console.log(JSON.stringify(deposits, null, 2));
          return;
        }
        console.log(chalk.green(`\nDeposits for ${address} (${deposits.length})`));
        console.log(chalk.blue("=".repeat(60)));
        for (const d of deposits) {
          console.log(chalk.yellow(`Deposit ${d.deposit_id}`));
          console.log(`  status:      ${d.status}`);
          console.log(`  amount_sats: ${d.amount_sats}`);
          console.log(`  alpha_bps:   ${d.alpha_bps}`);
          console.log(`  lock_ms:     ${d.lock_ms}`);
          console.log(`  due_at:      ${d.due_at ?? "n/a"}`);
          console.log(`  created_at:  ${d.created_at}`);
        }
        console.log("");
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        if (parentOptions.verbose) console.error(err.stack);
        process.exit(1);
      }
    });

  // ── btc-locker backend user-claimable <address> ──────────────────────────
  backendCmd
    .command("user-claimable <address>")
    .description("List confirmed distribution allocations available for withdrawal")
    .action(async (address) => {
      const parentOptions = program.opts();
      const serverUrl = resolveServerUrl(parentOptions);
      try {
        const allocations = await getUserClaimable(address, serverUrl);
        if (!allocations.length) {
          console.log(chalk.yellow("No claimable returns found for this address."));
          return;
        }
        if (parentOptions.json) {
          console.log(JSON.stringify(allocations, null, 2));
          return;
        }
        console.log(chalk.green(`\nClaimable Returns for ${address} (${allocations.length})`));
        console.log(chalk.blue("=".repeat(60)));
        let grandTotal = 0;
        for (const a of allocations) {
          grandTotal += a.total_return_sats ?? 0;
          console.log(chalk.yellow(`Deposit ${a.deposit_id}`));
          console.log(`  distribution_allocation_id: ${a.distribution_allocation_id}`);
          console.log(`  status:                     ${a.status}`);
          console.log(`  principal_return_sats:      ${a.principal_return_sats}`);
          console.log(`  yield_sats:                 ${a.yield_sats}`);
          console.log(`  total_return_sats:          ${a.total_return_sats}`);
        }
        console.log(chalk.cyan(`\nTotal claimable: ${grandTotal} sats`));
        console.log("");
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        if (parentOptions.verbose) console.error(err.stack);
        process.exit(1);
      }
    });
}
