/**
 * Solstice with a chain connection.
 *
 * The builders in `./tx` are pure: they turn inputs, a fee rate and a network
 * into a PSBT. This class holds a network and a {@link BitcoinAPI}, the way
 * btc-locker's `BTCLocker` does, and does the chain work around the builders:
 * funding inputs, fee rates, the checks on the etch commit, and broadcast. It
 * never sees a private key; the caller signs the PSBTs it returns.
 */

import * as bitcoin from "bitcoinjs-lib";
import {
  BitcoinAPI,
  FeePriorities,
  NETWORKS,
  type NetworkType,
} from "@sundial-protocol/btc-provider";
import type { UTXO } from "@sundial-protocol/btc-locker";
import type { ReceiptRune } from "./receipt/receipt-rune.js";
import type { RunestoneCodec } from "@sundial-protocol/btc-runes";
import {
  ETCH_COMMIT_CONFIRMATIONS,
  buildEtchCommitTransaction,
  createEtchCommitment,
  type EtchCommitParams,
  type EtchCommitResult,
} from "./tx/etch-commit.js";
import {
  buildEtchTransaction,
  type EtchParams,
  type EtchResult,
} from "./tx/etch.js";
import {
  buildInvestTransaction,
  buildSwapTransaction,
  buildWithdrawTransaction,
  type InvestParams,
  type SwapParams,
  type SwapResult,
  type WithdrawParams,
} from "./tx/swap.js";

/** How a method gets its fee rate: a rate, or a priority to ask the chain for. */
export interface FeeOptions {
  /** Fee rate in sat/vByte. When given, the chain is not asked. */
  feeRate?: number;
  /** Priority used to ask the chain for a rate (default medium). */
  priority?: FeePriorities;
}

/** What the class supplies itself, removed from a pure builder's parameters. */
type Supplied = "network" | "feeRate";

export interface SolsticeEtchCommitParams
  extends Omit<EtchCommitParams, Supplied | "inputs">,
    FeeOptions {
  /** Funding inputs. When omitted, they are taken from `sourceAddress`. */
  inputs?: UTXO[];
  /**
   * Address that funds the commit: the source of inputs when `inputs` is
   * omitted, the script of inputs that carry none, and the default change
   * address.
   */
  sourceAddress?: string;
}

export interface SolsticeEtchParams extends FeeOptions {
  /** The receipt rune to etch. */
  rune: ReceiptRune;
  /** Address that will hold the premined supply (the Receipt Vault). */
  vaultAddress: string;
  /** Sats attached to the vault-holding output (default 546). */
  vaultOutputValue?: number;
  /** The commit output from step 1. Its value is read from the chain. */
  commit: {
    txid: string;
    /** Index of the commit output (default 0). */
    vout?: number;
    /** The key the commitment was created for (x-only or compressed). */
    revealPublicKey: Uint8Array | string;
  };
  /**
   * Where change goes when `changeAddress` is not given, and the address to
   * top up from when the commit output no longer covers the fee. Without it, a
   * shortfall is an error.
   */
  sourceAddress?: string;
  /** Where BTC change is returned (default `sourceAddress`). */
  changeAddress?: string;
  codec?: RunestoneCodec;
}

export type SolsticeSwapParams = Omit<SwapParams, Supplied> & FeeOptions;
export type SolsticeInvestParams = Omit<InvestParams, Supplied> & FeeOptions;
export type SolsticeWithdrawParams = Omit<WithdrawParams, Supplied> & FeeOptions;

const isShortfall = (error: unknown): boolean =>
  /insufficient/.test((error as Error).message);

export class Solstice {
  public readonly networkType: NetworkType;
  public readonly network: bitcoin.Network;
  public readonly api: BitcoinAPI;

  /**
   * @param network - Network name ('bitcoin', 'testnet', 'testnet4', 'regtest') or a `NetworkType`
   * @param api - Optional BitcoinAPI instance (a default one is created if not provided)
   * @example
   * const solstice = new Solstice("testnet");
   *
   * // With a chosen provider order
   * const api = new BitcoinAPI("testnet", ["blockstream", "mempool"]);
   * const solstice = new Solstice("testnet", api);
   */
  constructor(network: NetworkType | string = NETWORKS.testnet, api?: BitcoinAPI) {
    const networkType = typeof network === "string" ? NETWORKS[network] : network;
    if (!networkType?.info || !networkType.name) {
      throw new Error(`Unknown network: ${String(network)}`);
    }
    this.networkType = networkType;
    this.network = networkType.info;
    this.api = api ?? new BitcoinAPI(networkType);
  }

  // ── Chain reads ────────────────────────────────────────────────────────────

  /** Fee rate in sat/vByte for a priority, from this instance's API. */
  async getFeeRate(priority: FeePriorities = FeePriorities.MEDIUM): Promise<number> {
    return this.api.queryChainFeeRates(priority);
  }

  /** Confirmations of a transaction: 0 while unconfirmed. */
  async getConfirmations(txid: string): Promise<number> {
    return this.api.getConfirmations(txid);
  }

  /** Confirmed UTXOs of an address, largest first, as builder inputs. */
  async fetchFundingInputs(address: string): Promise<UTXO[]> {
    const utxos = await this.api.fetchConfirmedUtxos(address);
    return utxos
      .filter((u) => !u.doNotSpend)
      .map((u) => ({ txid: u.txid, vout: u.vout, value: u.value }))
      .sort((a, b) => b.value - a.value);
  }

  /** Broadcast a signed transaction. Returns its txid. */
  async broadcastTransaction(signedHex: string): Promise<string> {
    const txid = bitcoin.Transaction.fromHex(signedHex).getId();
    const broadcast = await this.api.broadcastTransaction(signedHex);
    return broadcast?.txid || txid;
  }

  // ── C0: etch ───────────────────────────────────────────────────────────────

  /**
   * Etch step 1: the commit transaction. Without `inputs`, it is funded from
   * the confirmed UTXOs of `sourceAddress`, using as few as cover it.
   *
   * The chain API cannot tell which UTXOs carry runes. If `sourceAddress` holds
   * any, pass `inputs` yourself: a rune-carrying input spent here moves its
   * runes into the commit output.
   */
  async buildEtchCommitTransaction(
    params: SolsticeEtchCommitParams,
  ): Promise<EtchCommitResult> {
    const { inputs, sourceAddress, priority, ...rest } = params;
    const feeRate = params.feeRate ?? (await this.getFeeRate(priority));
    const build = (funding: UTXO[]) =>
      buildEtchCommitTransaction({
        ...rest,
        inputs: funding,
        sourceScript: rest.sourceScript ?? this.scriptOf(sourceAddress),
        changeAddress: rest.changeAddress ?? sourceAddress,
        feeRate,
        network: this.network,
      });

    if (inputs) return build(inputs);
    if (!sourceAddress) {
      throw new Error("etch commit: either inputs or sourceAddress must be provided");
    }
    return this.fundFrom(sourceAddress, build);
  }

  /**
   * Etch step 2: the etching, which spends the commit output. Refuses when the
   * output does not commit to this rune with this key, or when the commit is too
   * young: an etching that confirms before the commit has
   * {@link ETCH_COMMIT_CONFIRMATIONS} confirmations is ignored by indexers, and
   * the commit output is spent for nothing.
   */
  async buildEtchTransaction(params: SolsticeEtchParams): Promise<EtchResult> {
    const { rune, commit, sourceAddress, priority } = params;
    const vout = commit.vout ?? 0;
    const commitment = createEtchCommitment(rune, commit.revealPublicKey, this.network);

    const commitTx = bitcoin.Transaction.fromHex(await this.api.getTransaction(commit.txid));
    const commitOut = commitTx.outs[vout];
    if (
      !commitOut ||
      Buffer.from(commitOut.script).toString("hex") !== commitment.scriptPubKeyHex
    ) {
      throw new Error(
        `${commit.txid}:${vout} does not commit to ${rune.name} with this key. Use the same name and key as in step 1.`,
      );
    }

    const needed = ETCH_COMMIT_CONFIRMATIONS - 1;
    const confirmations = await this.getConfirmations(commit.txid);
    if (confirmations < needed) {
      throw new Error(
        `the commit has ${confirmations} confirmation(s); wait for ${needed} before etching (the etching must confirm at ${ETCH_COMMIT_CONFIRMATIONS} or later)`,
      );
    }

    const base: EtchParams = {
      rune,
      vaultAddress: params.vaultAddress,
      vaultOutputValue: params.vaultOutputValue,
      commit: {
        txid: commit.txid,
        vout,
        value: Number(commitOut.value),
        revealPublicKey: commit.revealPublicKey,
      },
      // Also on this first build: without a change address, whatever the
      // commit output holds above the vault output and the fee goes to the miner.
      changeAddress: params.changeAddress ?? sourceAddress,
      feeRate: params.feeRate ?? (await this.getFeeRate(priority)),
      network: this.network,
      codec: params.codec,
    };
    try {
      return buildEtchTransaction(base);
    } catch (error) {
      if (!isShortfall(error) || !sourceAddress) throw error;
    }
    // Fees rose since the commit: top up from the funding address.
    return this.fundFrom(sourceAddress, (funding) =>
      buildEtchTransaction({
        ...base,
        inputs: funding,
        sourceScript: this.scriptOf(sourceAddress),
      }),
    );
  }

  // ── C1 / C2: swaps ─────────────────────────────────────────────────────────
  // Swap inputs are always the caller's: rune balances are not visible to the
  // chain API, so this class does not pick them.

  /** The generic atomic BTC⇄RT swap, on this network. */
  async buildSwapTransaction(params: SolsticeSwapParams): Promise<SwapResult> {
    return buildSwapTransaction(await this.withChain(params));
  }

  /** C1 Investment, on this network. */
  async buildInvestTransaction(params: SolsticeInvestParams): Promise<SwapResult> {
    return buildInvestTransaction(await this.withChain(params));
  }

  /** C2 Standard Withdrawal, on this network. */
  async buildWithdrawTransaction(params: SolsticeWithdrawParams): Promise<SwapResult> {
    return buildWithdrawTransaction(await this.withChain(params));
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /** Add this network and a fee rate to a builder's parameters. */
  private async withChain<P extends FeeOptions>(
    params: P,
  ): Promise<Omit<P, "priority"> & { feeRate: number; network: bitcoin.Network }> {
    const { priority, ...rest } = params;
    return {
      ...rest,
      feeRate: params.feeRate ?? (await this.getFeeRate(priority)),
      network: this.network,
    };
  }

  private scriptOf(address: string | undefined): Buffer | undefined {
    return address
      ? Buffer.from(bitcoin.address.toOutputScript(address, this.network))
      : undefined;
  }

  /**
   * Run `build` with the largest confirmed UTXOs of `address`, adding one at a
   * time until it stops reporting a shortfall.
   */
  private async fundFrom<T>(address: string, build: (inputs: UTXO[]) => T): Promise<T> {
    const available = await this.fetchFundingInputs(address);
    if (available.length === 0) {
      throw new Error(`no confirmed UTXOs at the funding address ${address}`);
    }
    for (let count = 1; ; count++) {
      try {
        return build(available.slice(0, count));
      } catch (error) {
        if (!isShortfall(error) || count >= available.length) throw error;
      }
    }
  }
}
