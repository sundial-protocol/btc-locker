/**
 * Solstice commands for the BTC Locker CLI.
 *
 * Exercises the @sundial-protocol/solstice Runes receipt-token + atomic-swap
 * layer against a live network (testnet by default):
 *   • solstice etch    — C0: premine a receipt rune into a vault address. Two
 *                        transactions: a commit, then the etching 5 blocks later.
 *   • solstice swap     — C1/C2: atomic BTC⇄RT swap from explicit UTXOs.
 *   • solstice decode   — inspect any runestone scriptPubKey (offline).
 */

import * as bitcoin from "bitcoinjs-lib";
import inquirer from "inquirer";
import chalk from "chalk";
import { FeeUtils, ScriptUtils } from "@sundial-protocol/btc-locker";
import BitcoinAPI from "@sundial-protocol/btc-locker/bitcoin-api";
import { NETWORKS } from "@sundial-protocol/btc-locker/utils/network";
import {
  ETCH_COMMIT_CONFIRMATIONS,
  buildEtchCommitTransaction,
  buildEtchTransaction,
  buildSwapTransaction,
  createEtchCommitment,
  formatSpacedRune,
  nativeRunestoneCodec,
  parseRuneId,
  parseSpacedRune,
} from "@sundial-protocol/solstice";
import { initLocker, displayResult } from "./shared.js";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Resolve network context from the parent CLI options. */
function resolveNetwork(parentOptions) {
  const networkName =
    parentOptions.network === "mainnet" ? "bitcoin" : parentOptions.network;
  const networkType = NETWORKS[networkName] || NETWORKS.testnet;
  return {
    networkName,
    networkType,
    network: networkType.info,
    api: new BitcoinAPI(networkType),
  };
}

/** Recursively convert BigInt to string so results are JSON/log-safe. */
function jsonSafe(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, jsonSafe(v)]),
    );
  }
  return value;
}

/** Parse `txid:vout:value:runeAmount` into a RuneUtxo. */
function parseRuneUtxo(spec) {
  const [txid, vout, value, runeAmount] = spec.split(":");
  if (!txid || vout === undefined || value === undefined || runeAmount === undefined) {
    throw new Error(
      `invalid --rt-utxo "${spec}"; expected txid:vout:value:runeAmount`,
    );
  }
  return {
    txid,
    vout: parseInt(vout, 10),
    value: parseInt(value, 10),
    runeAmount: BigInt(runeAmount),
  };
}

/** Parse `txid:vout:value` into a plain UTXO. */
function parseBtcUtxo(spec) {
  const [txid, vout, value] = spec.split(":");
  if (!txid || vout === undefined || value === undefined) {
    throw new Error(`invalid --btc-utxo "${spec}"; expected txid:vout:value`);
  }
  return { txid, vout: parseInt(vout, 10), value: parseInt(value, 10) };
}

/** Split a whitespace/comma-separated prompt answer into a clean list. */
function splitList(s) {
  return String(s || "")
    .split(/[\s,]+/)
    .filter(Boolean);
}

/** Validate a positive-integer string for a prompt. */
function validatePositiveInt(v) {
  const n = parseInt(v, 10);
  return (Number.isInteger(n) && n > 0) || "Must be a positive integer";
}

/** Validate a positive BigInt string for a prompt. */
function validatePositiveBigInt(v) {
  try {
    return BigInt(v) > 0n || "Must be greater than 0";
  } catch {
    return "Must be an integer";
  }
}

function explorerTxUrl(network, txid) {
  return network === "testnet"
    ? `https://mempool.space/testnet/tx/${txid}`
    : `https://mempool.space/tx/${txid}`;
}

// ── command wiring ───────────────────────────────────────────────────────────

export function setupSolsticeCommands(program) {
  const solstice = program
    .command("solstice")
    .description("Solstice receipt-token (Runes) + atomic-swap tools");

  solstice
    .command("etch")
    .description(
      "C0: etch a receipt rune, premining full supply into a vault address. Step 1 (no --commit) broadcasts the commitment; step 2 (--commit <txid>, 5 confirmations later) broadcasts the etching.",
    )
    .option("-k, --from-key <hex>", "Funding, commit and etch signer private key (hex)")
    .option("--name <RUNENAME>", "Rune name, A–Z; spacers as • or . (e.g. SOLSTICE.RECEIPT)")
    .option("--commit <txid>", "Step 2: txid of the confirmed commit transaction from step 1")
    .option("--wait", "After step 1, wait for 5 confirmations and run step 2 in the same call")
    .option("--supply <int>", "Total premined supply (integer, base units)")
    .option("--vault <address>", "Vault address to hold the premine (default: from-key address)")
    .option("--ticker <ticker>", "Display ticker (UX only), e.g. RT")
    .option("--symbol <char>", "Single display glyph")
    .option("--divisibility <n>", "Decimal places (0–38)", "8")
    .option("--vault-value <sats>", "Sats attached to the vault output", "546")
    .option("-p, --priority <level>", "Fee priority: high, medium, low", "medium")
    .option("--fee-rate <satvb>", "Override fee rate in sat/vByte")
    .option("--dry-run", "Build and print the PSBT of the current step but do not sign/broadcast")
    .action(async (cmd) => {
      await handleEtch(cmd, program.opts());
    });

  solstice
    .command("swap")
    .description("C1/C2: build an atomic BTC⇄RT swap from explicit UTXOs")
    .option("--rune-id <block:tx>", "Etched rune id")
    .option("--rt-utxo <txid:vout:value:runeAmount>", "Rune-carrying input (repeatable)", (v, a) => [...a, v], [])
    .option("--rt-amount <int>", "Rune amount to deliver to the RT recipient")
    .option("--rt-to <address>", "RT recipient address")
    .option("--rt-change <address>", "RT (rune) change address")
    .option("--btc-utxo <txid:vout:value>", "BTC-funding input (repeatable)", (v, a) => [...a, v], [])
    .option("--btc-amount <sats>", "Sats delivered to the BTC recipient")
    .option("--btc-to <address>", "BTC recipient address")
    .option("--btc-change <address>", "BTC change address")
    .option("--rt-owner <address>", "Address owning the RT inputs (for scriptPubKey; defaults to --rt-key's address)")
    .option("--btc-owner <address>", "Address owning the BTC inputs (for scriptPubKey; defaults to --btc-key's address)")
    .option("--rt-key <hex>", "Signer for the RT inputs (hex)")
    .option("--btc-key <hex>", "Signer for the BTC inputs (hex)")
    .option("--rune-output-value <sats>", "Sats attached to each rune output", "546")
    .option("--fee-rate <satvb>", "Override fee rate in sat/vByte")
    .option("-p, --priority <level>", "Fee priority: high, medium, low", "medium")
    .option("--dry-run", "Build and print the PSBT but do not sign/broadcast")
    .action(async (cmd) => {
      await handleSwap(cmd, program.opts());
    });

  solstice
    .command("decode")
    .description("Decode a runestone scriptPubKey (hex) and report cenotaph status")
    .option("-s, --script <hex>", "OP_RETURN scriptPubKey hex")
    .action(async (cmd) => {
      await handleDecode(cmd, program.opts());
    });
}

// ── etch steps (exported so the regtest suite can drive them without prompts) ──

/** Confirmations of a transaction: 0 while unconfirmed. */
export async function confirmationsOf(api, txid) {
  const status = await api.makeRequest(`/tx/${txid}/status`);
  if (!status?.confirmed) return 0;
  return (await api.getBlockHeight()) - status.block_height + 1;
}

/** Confirmed UTXOs of an address, as builder inputs. */
async function confirmedInputs(api, address) {
  return (await api.getAddressUtxos(address))
    .filter((u) => u.status?.confirmed)
    .map((u) => ({ txid: u.txid, vout: u.vout, value: u.value }));
}

/**
 * Etch step 1: build the commit transaction, funded from the key's own address.
 * `ctx` is `{ api, locker, network }`.
 */
export async function buildEtchCommit(ctx, { rune, fromKey, feeRate, vaultOutputValue }) {
  const keyPair = await ctx.locker.keyPairGenerator.generateKeyPairFromPrivateKey(fromKey);
  const inputs = await confirmedInputs(ctx.api, keyPair.address);
  if (inputs.length === 0) {
    throw new Error(`no confirmed UTXOs at the funding address ${keyPair.address}`);
  }
  return buildEtchCommitTransaction({
    rune,
    revealPublicKey: keyPair.publicKey,
    vaultOutputValue,
    inputs,
    sourceScript: bitcoin.address.toOutputScript(keyPair.address, ctx.network),
    changeAddress: keyPair.address,
    feeRate,
    network: ctx.network,
  });
}

/**
 * Etch step 2: build the etching, which spends the commit output. Refuses when
 * the output does not commit to this rune with this key, or when the commit is
 * too young: an etching that confirms before the commit has 6 confirmations is
 * ignored by indexers, and the commit output is spent for nothing.
 */
export async function buildEtchReveal(
  ctx,
  { rune, fromKey, vaultAddress, vaultOutputValue, commitTxid, commitVout = 0, feeRate },
) {
  const keyPair = await ctx.locker.keyPairGenerator.generateKeyPairFromPrivateKey(fromKey);
  const commitment = createEtchCommitment(rune, keyPair.publicKey, ctx.network);

  const commitTx = bitcoin.Transaction.fromHex(await ctx.api.getTransaction(commitTxid));
  const commitOut = commitTx.outs[commitVout];
  if (!commitOut || Buffer.from(commitOut.script).toString("hex") !== commitment.scriptPubKeyHex) {
    throw new Error(
      `${commitTxid}:${commitVout} does not commit to ${rune.name} with this key. Use the same name and key as in step 1.`,
    );
  }

  const needed = ETCH_COMMIT_CONFIRMATIONS - 1;
  const confirmations = await confirmationsOf(ctx.api, commitTxid);
  if (confirmations < needed) {
    throw new Error(
      `the commit has ${confirmations} confirmation(s); wait for ${needed} before etching (the etching must confirm at ${ETCH_COMMIT_CONFIRMATIONS} or later)`,
    );
  }

  const params = {
    rune,
    vaultAddress: vaultAddress || keyPair.address,
    vaultOutputValue,
    commit: {
      txid: commitTxid,
      vout: commitVout,
      value: Number(commitOut.value),
      revealPublicKey: keyPair.publicKey,
    },
    feeRate,
    network: ctx.network,
  };
  try {
    return buildEtchTransaction(params);
  } catch (error) {
    if (!/insufficient/.test(error.message)) throw error;
    // Fees rose since the commit: top up from the funding address.
    return buildEtchTransaction({
      ...params,
      inputs: await confirmedInputs(ctx.api, keyPair.address),
      sourceScript: bitcoin.address.toOutputScript(keyPair.address, ctx.network),
      changeAddress: keyPair.address,
    });
  }
}

/** Sign every input with `fromKey`, broadcast, return the txid. */
export async function signAndBroadcast(ctx, psbtBase64, fromKey) {
  const signedHex = await ctx.locker.signTransaction(psbtBase64, fromKey);
  const txid = bitcoin.Transaction.fromHex(signedHex).getId();
  const broadcast = await ctx.api.broadcastTransaction(signedHex);
  return broadcast?.txid || txid;
}

// ── handlers ─────────────────────────────────────────────────────────────────

async function handleEtch(cmd, parentOptions) {
  const { networkName, networkType, network, api } = resolveNetwork(parentOptions);

  try {
    const locker = await initLocker(parentOptions);
    const ctx = { api, locker, network };

    let fromKey = cmd.fromKey;
    let name = cmd.name;
    let supply = cmd.supply;
    let vault = cmd.vault;
    let ticker = cmd.ticker;
    let symbol = cmd.symbol;

    // Interactive: prompt for whatever the essential flags didn't provide.
    if (!fromKey || !name || !supply) {
      const a = await inquirer.prompt([
        {
          type: "input",
          name: "fromKey",
          message: "Funding/etch private key (hex):",
          when: () => !fromKey,
          validate: (v) => ScriptUtils.isValidPrivateKey(v) || "Invalid private key",
        },
        {
          type: "input",
          name: "name",
          message: "Rune name (A–Z, spacers as • or . allowed, e.g. SOLSTICE.RECEIPT):",
          when: () => !name,
          validate: (v) => {
            try {
              parseSpacedRune(v.toUpperCase());
              return true;
            } catch (e) {
              return e.message;
            }
          },
        },
        {
          type: "input",
          name: "supply",
          message: "Total premined supply (integer, base units):",
          when: () => !supply,
          validate: validatePositiveBigInt,
        },
        {
          type: "input",
          name: "vault",
          message: "Vault address (blank = your funding address):",
          when: () => !vault,
          validate: (v) => !v || ScriptUtils.isValidAddress(v, network) || "Invalid address",
        },
        {
          type: "input",
          name: "ticker",
          message: "Display ticker (optional, e.g. RT):",
          when: () => !ticker,
        },
        {
          type: "input",
          name: "symbol",
          message: "Symbol glyph (optional):",
          when: () => !symbol,
        },
      ]);
      fromKey = fromKey || a.fromKey;
      name = name || a.name;
      supply = supply || a.supply;
      vault = vault || a.vault || undefined;
      ticker = ticker || a.ticker || undefined;
      symbol = symbol || a.symbol || undefined;
    }

    const spaced = parseSpacedRune(name.toUpperCase());
    const rune = {
      name: spaced.name,
      spacers: spaced.spacers || undefined,
      displayTicker: ticker || spaced.name,
      divisibility: parseInt(cmd.divisibility, 10),
      symbol: symbol ? symbol.codePointAt(0) : undefined,
      totalSupply: BigInt(supply),
    };
    const displayName = formatSpacedRune(rune.name, rune.spacers);
    const vaultOutputValue = parseInt(cmd.vaultValue, 10);
    const feeRate = async () =>
      cmd.feeRate
        ? parseInt(cmd.feeRate, 10)
        : await FeeUtils.queryChainFeeRates(cmd.priority, networkType);

    const needed = ETCH_COMMIT_CONFIRMATIONS - 1;
    let commitTxid = cmd.commit;

    // ── Step 1: commit ───────────────────────────────────────────────────────
    if (!commitTxid) {
      const rate = await feeRate();
      const res = await buildEtchCommit(ctx, { rune, fromKey, feeRate: rate, vaultOutputValue });

      displayResult(
        jsonSafe({
          rune: displayName,
          commitAddress: res.commitment.address,
          commitOutputValue: res.commitOutputValue,
          feeRateSatVb: rate,
          estimatedFee: res.fee,
          change: res.changeSats,
          outputs: res.outputs,
        }),
        parentOptions,
        "Solstice Etch (C0) step 1 of 2: commit, built",
      );
      console.log(
        chalk.gray(
          "The commit output can only be spent by this key. The same key signs step 2 and so decides where the premine goes.",
        ),
      );

      if (cmd.dryRun) {
        console.log(chalk.yellow("🔍 Dry run — not broadcast."));
        console.log(chalk.blue(`PSBT (base64): ${res.psbtBase64}`));
        return;
      }

      const { confirm } = await inquirer.prompt([
        { type: "confirm", name: "confirm", message: `Commit to ${displayName} on ${networkName}?`, default: false },
      ]);
      if (!confirm) return console.log(chalk.yellow("⏹️  Cancelled."));

      console.log(chalk.blue("Broadcasting..."));
      commitTxid = await signAndBroadcast(ctx, res.psbtBase64, fromKey);
      console.log(chalk.green("✅ Commit broadcast."));
      console.log(chalk.blue(`Commit txid: ${commitTxid}`));
      console.log(chalk.blue(`Explorer: ${explorerTxUrl(networkName, commitTxid)}`));

      if (!cmd.wait) {
        console.log(
          chalk.yellow(
            `Step 2: once the commit has ${needed} confirmations, run the same command again with --commit ${commitTxid}`,
          ),
        );
        return;
      }

      console.log(chalk.blue(`Waiting for ${needed} confirmations...`));
      for (;;) {
        const confirmations = await confirmationsOf(api, commitTxid);
        if (confirmations >= needed) break;
        console.log(chalk.gray(`  ${confirmations}/${needed}`));
        await new Promise((resolve) => setTimeout(resolve, 60_000));
      }
    }

    // ── Step 2: reveal (the etching itself) ──────────────────────────────────
    const rate = await feeRate();
    const res = await buildEtchReveal(ctx, {
      rune,
      fromKey,
      vaultAddress: vault,
      vaultOutputValue,
      commitTxid,
      feeRate: rate,
    });

    displayResult(
      jsonSafe({
        rune: { name: displayName, ticker: rune.displayTicker, divisibility: rune.divisibility, supply: rune.totalSupply },
        commit: `${commitTxid}:0`,
        vaultAddress: res.outputs[0].address,
        feeRateSatVb: rate,
        fee: res.fee,
        change: res.changeSats,
        runestoneScriptHex: res.runestoneScriptHex,
        outputs: res.outputs,
      }),
      parentOptions,
      "Solstice Etch (C0) step 2 of 2: etch, built",
    );

    if (cmd.dryRun) {
      console.log(chalk.yellow("🔍 Dry run — not broadcast."));
      console.log(chalk.blue(`PSBT (base64): ${res.psbtBase64}`));
      return;
    }

    const { confirm } = await inquirer.prompt([
      { type: "confirm", name: "confirm", message: `Etch ${displayName} (supply ${supply}) on ${networkName}?`, default: false },
    ]);
    if (!confirm) return console.log(chalk.yellow("⏹️  Cancelled."));

    console.log(chalk.blue("Broadcasting..."));
    const finalTxid = await signAndBroadcast(ctx, res.psbtBase64, fromKey);

    console.log(chalk.green("✅ Etch broadcast."));
    console.log(chalk.blue(`Txid: ${finalTxid}`));
    console.log(chalk.blue(`Explorer: ${explorerTxUrl(networkName, finalTxid)}`));
    console.log(
      chalk.gray(
        "Rune id is assigned on confirmation as <blockHeight>:<txIndexInBlock>; read it from a Runes explorer, then pass it to `solstice swap --rune-id`.",
      ),
    );
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    if (parentOptions.verbose) console.error(error.stack);
  }
}

async function handleSwap(cmd, parentOptions) {
  const { networkName, networkType, network, api } = resolveNetwork(parentOptions);

  try {
    const locker = await initLocker(parentOptions);

    let runeId = cmd.runeId;
    let rtUtxoSpecs = cmd.rtUtxo;
    let rtAmount = cmd.rtAmount;
    let rtTo = cmd.rtTo;
    let rtChange = cmd.rtChange;
    let btcUtxoSpecs = cmd.btcUtxo;
    let btcAmount = cmd.btcAmount;
    let btcTo = cmd.btcTo;
    let btcChange = cmd.btcChange;
    let rtKey = cmd.rtKey;
    let btcKey = cmd.btcKey;
    let rtOwner = cmd.rtOwner;
    let btcOwner = cmd.btcOwner;

    const addr = (v) => ScriptUtils.isValidAddress(v, network) || "Invalid address";
    const optAddr = (v) => !v || ScriptUtils.isValidAddress(v, network) || "Invalid address";
    const optKey = (v) => !v || ScriptUtils.isValidPrivateKey(v) || "Invalid private key";

    // Interactive: prompt for whatever the flags didn't provide.
    if (
      !runeId || rtUtxoSpecs.length === 0 || !rtAmount || !rtTo || !rtChange ||
      btcUtxoSpecs.length === 0 || !btcAmount || !btcTo
    ) {
      const a = await inquirer.prompt([
        { type: "input", name: "runeId", message: "Rune id (block:tx):", when: () => !runeId,
          validate: (v) => { try { parseRuneId(v); return true; } catch (e) { return e.message; } } },
        { type: "input", name: "rtUtxos", message: "RT input UTXO(s) — txid:vout:value:runeAmount (space-separated):", when: () => rtUtxoSpecs.length === 0,
          validate: (v) => { const l = splitList(v); if (l.length === 0) return "At least one"; try { l.forEach(parseRuneUtxo); return true; } catch (e) { return e.message; } } },
        { type: "input", name: "rtAmount", message: "RT amount to deliver:", when: () => !rtAmount, validate: validatePositiveBigInt },
        { type: "input", name: "rtTo", message: "RT recipient address:", when: () => !rtTo, validate: addr },
        { type: "input", name: "rtChange", message: "RT (rune) change address:", when: () => !rtChange, validate: addr },
        { type: "input", name: "btcUtxos", message: "BTC input UTXO(s) — txid:vout:value (space-separated):", when: () => btcUtxoSpecs.length === 0,
          validate: (v) => { const l = splitList(v); if (l.length === 0) return "At least one"; try { l.forEach(parseBtcUtxo); return true; } catch (e) { return e.message; } } },
        { type: "input", name: "btcAmount", message: "BTC amount to deliver (sats):", when: () => !btcAmount, validate: validatePositiveInt },
        { type: "input", name: "btcTo", message: "BTC recipient address:", when: () => !btcTo, validate: addr },
        { type: "input", name: "btcChange", message: "BTC change address (optional):", when: () => !btcChange, validate: optAddr },
        { type: "input", name: "rtKey", message: "RT signer private key (blank to build an unsigned PSBT):", when: () => !rtKey && !rtOwner, validate: optKey },
        { type: "input", name: "rtOwner", message: "RT input owner address:", when: (ans) => !rtKey && !rtOwner && !ans.rtKey, validate: addr },
        { type: "input", name: "btcKey", message: "BTC signer private key (blank to build an unsigned PSBT):", when: () => !btcKey && !btcOwner, validate: optKey },
        { type: "input", name: "btcOwner", message: "BTC input owner address:", when: (ans) => !btcKey && !btcOwner && !ans.btcKey, validate: addr },
      ]);
      runeId = runeId || a.runeId;
      rtUtxoSpecs = rtUtxoSpecs.length ? rtUtxoSpecs : splitList(a.rtUtxos);
      rtAmount = rtAmount || a.rtAmount;
      rtTo = rtTo || a.rtTo;
      rtChange = rtChange || a.rtChange;
      btcUtxoSpecs = btcUtxoSpecs.length ? btcUtxoSpecs : splitList(a.btcUtxos);
      btcAmount = btcAmount || a.btcAmount;
      btcTo = btcTo || a.btcTo;
      btcChange = btcChange || a.btcChange || undefined;
      rtKey = rtKey || a.rtKey || undefined;
      rtOwner = rtOwner || a.rtOwner || undefined;
      btcKey = btcKey || a.btcKey || undefined;
      btcOwner = btcOwner || a.btcOwner || undefined;
    }

    const rune = {
      name: "RECEIPT", // name is unused by swap (edicts reference the id only)
      displayTicker: "RT",
      divisibility: 8,
      totalSupply: 1n,
      id: parseRuneId(runeId),
    };

    const rtInputs = rtUtxoSpecs.map(parseRuneUtxo);
    const btcInputs = btcUtxoSpecs.map(parseBtcUtxo);

    // Each input group's scriptPubKey comes from its owner address, which
    // defaults to the signing key's address. Owner values let you build a PSBT for
    // a counterparty to sign without holding their key.
    const resolvedRtOwner =
      rtOwner ||
      (rtKey && (await locker.keyPairGenerator.generateKeyPairFromPrivateKey(rtKey)).address);
    const resolvedBtcOwner =
      btcOwner ||
      (btcKey && (await locker.keyPairGenerator.generateKeyPairFromPrivateKey(btcKey)).address);
    if (!resolvedRtOwner) throw new Error("provide --rt-owner or --rt-key so the RT input scriptPubKey can be derived");
    if (!resolvedBtcOwner) throw new Error("provide --btc-owner or --btc-key so the BTC input scriptPubKey can be derived");
    const rtSourceScript = bitcoin.address.toOutputScript(resolvedRtOwner, network);
    const btcSourceScript = bitcoin.address.toOutputScript(resolvedBtcOwner, network);

    const feeRate = cmd.feeRate
      ? parseInt(cmd.feeRate, 10)
      : await FeeUtils.queryChainFeeRates(cmd.priority, networkType);

    const res = buildSwapTransaction({
      rune,
      rt: {
        inputs: rtInputs,
        amount: BigInt(rtAmount),
        recipientAddress: rtTo,
        changeAddress: rtChange,
        sourceScript: rtSourceScript,
      },
      btc: {
        inputs: btcInputs,
        amount: parseInt(btcAmount, 10),
        recipientAddress: btcTo,
        changeAddress: btcChange,
        sourceScript: btcSourceScript,
      },
      runeOutputValue: parseInt(cmd.runeOutputValue, 10),
      feeRate,
      network,
    });

    displayResult(
      jsonSafe({
        runeId,
        feeRateSatVb: feeRate,
        estimatedFee: res.fee,
        runeChange: res.runeChange,
        btcChange: res.btcChangeSats,
        runestone: res.runestone,
        runestoneScriptHex: res.runestoneScriptHex,
        outputs: res.outputs,
      }),
      parentOptions,
      "Solstice Swap (C1/C2) — built",
    );

    if (cmd.dryRun) {
      console.log(chalk.yellow("🔍 Dry run — not broadcast."));
      console.log(chalk.blue(`PSBT (base64): ${res.psbtBase64}`));
      return;
    }

    if (!rtKey && !btcKey) {
      console.log(chalk.yellow("No signing keys provided; the unsigned PSBT above can be co-signed by each party."));
      console.log(chalk.blue(`PSBT (base64): ${res.psbtBase64}`));
      return;
    }

    // Build a per-input key list: RT inputs first, then BTC inputs.
    const signRtKey = rtKey || btcKey;
    const signBtcKey = btcKey || rtKey;
    const keys = [
      ...rtInputs.map(() => signRtKey),
      ...btcInputs.map(() => signBtcKey),
    ];

    const { confirm } = await inquirer.prompt([
      { type: "confirm", name: "confirm", message: `Broadcast the swap on ${networkName}?`, default: false },
    ]);
    if (!confirm) return console.log(chalk.yellow("⏹️  Cancelled."));

    const signedHex = await locker.signTransaction(res.psbtBase64, keys);
    const txid = bitcoin.Transaction.fromHex(signedHex).getId();
    console.log(chalk.blue("Broadcasting..."));
    const broadcast = await api.broadcastTransaction(signedHex);
    const finalTxid = broadcast.txid || txid;

    console.log(chalk.green("✅ Swap broadcast."));
    console.log(chalk.blue(`Txid: ${finalTxid}`));
    console.log(chalk.blue(`Explorer: ${explorerTxUrl(networkName, finalTxid)}`));
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    if (parentOptions.verbose) console.error(error.stack);
  }
}

async function handleDecode(cmd, parentOptions) {
  try {
    let scriptHex = cmd.script;
    if (!scriptHex) {
      const a = await inquirer.prompt([
        {
          type: "input",
          name: "scriptHex",
          message: "Runestone scriptPubKey (hex):",
          validate: (v) => /^[0-9a-fA-F]+$/.test(v) || "Must be a hex string",
        },
      ]);
      scriptHex = a.scriptHex;
    }
    const script = Buffer.from(scriptHex, "hex");
    const decoded = nativeRunestoneCodec.decipher(script);
    displayResult(
      jsonSafe({
        cenotaph: decoded.cenotaph,
        flaws: decoded.flaws,
        runestone: decoded.runestone,
      }),
      parentOptions,
      "Runestone Decode",
    );
    if (decoded.cenotaph) {
      console.log(chalk.red("⚠️  This scriptPubKey is a cenotaph (Runes indexers would burn affected runes)."));
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    if (parentOptions.verbose) console.error(error.stack);
  }
}
