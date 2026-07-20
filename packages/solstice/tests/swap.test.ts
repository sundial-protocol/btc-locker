import { describe, test, expect } from "vitest";
import * as bitcoin from "bitcoinjs-lib";
import {
  buildInvestTransaction,
  buildWithdrawTransaction,
} from "../src/tx/swap";
import { nativeRunestoneCodec } from "../src/runes/native-codec";
import type { ReceiptRune } from "../src/receipt/receipt-rune";
import type { RuneUtxo } from "../src/tx/types";
import { NETWORK, p2wpkh, txid } from "./helpers";

const rune: ReceiptRune = {
  name: "SUNDIALQBTC",
  displayTicker: "qBTC",
  id: { block: 840000n, tx: 7n },
  divisibility: 8,
  symbol: 0x71,
  totalSupply: 2_100_000_000_000_000n,
};

const vault = p2wpkh(1);
const investor = p2wpkh(2);
const yp = p2wpkh(3);
const buffer = p2wpkh(4);

describe("buildInvestTransaction (C1)", () => {
  test("moves RT Vault→investor and BTC investor→YP atomically, with rune change to Vault", () => {
    const vaultRt: RuneUtxo = {
      txid: txid(1), vout: 0, value: 1_000, scriptPubKey: vault.scriptHex, runeAmount: 1_000_000n,
    };
    const res = buildInvestTransaction({
      rune,
      vaultRtInputs: [vaultRt],
      rtAmount: 400_000n,
      investorRtAddress: investor.address,
      vaultRtChangeAddress: vault.address,
      investorBtcInputs: [{ txid: txid(2), vout: 1, value: 100_000, scriptPubKey: investor.scriptHex }],
      btcAmount: 90_000,
      ypDeploymentAddress: yp.address,
      investorBtcChangeAddress: investor.address,
      feeRate: 5,
      network: NETWORK,
    });

    expect(res.outputs.map((o) => o.role)).toEqual([
      "rt recipient",
      "rt change",
      "btc recipient",
      "runestone",
      "btc change",
    ]);
    expect(res.runeChange).toBe(600_000n);

    // Edict delivers 400k RT to output 0 (investor); pointer sends the 600k
    // rune change to output 1 (Vault).
    const decoded = nativeRunestoneCodec.decipher(Buffer.from(res.runestoneScriptHex, "hex"));
    expect(decoded.cenotaph).toBe(false);
    expect(decoded.runestone.edicts).toEqual([
      { id: rune.id, amount: 400_000n, output: 0 },
    ]);
    expect(decoded.runestone.pointer).toBe(1);

    // Sats conserve: in = runeOutputs(2*546) + btcToYp + fee + btcChange.
    const psbt = bitcoin.Psbt.fromBase64(res.psbtBase64, { network: NETWORK });
    expect(psbt.txOutputs[2].value).toBe(90_000n); // BTC to YP
    expect(101_000).toBe(2 * 546 + 90_000 + res.fee + res.btcChangeSats);
  });

  test("throws when rt amount exceeds available rune balance", () => {
    expect(() =>
      buildInvestTransaction({
        rune,
        vaultRtInputs: [{ txid: txid(1), vout: 0, value: 1_000, scriptPubKey: vault.scriptHex, runeAmount: 100n }],
        rtAmount: 400_000n,
        investorRtAddress: investor.address,
        vaultRtChangeAddress: vault.address,
        investorBtcInputs: [{ txid: txid(2), vout: 1, value: 100_000, scriptPubKey: investor.scriptHex }],
        btcAmount: 90_000,
        ypDeploymentAddress: yp.address,
        feeRate: 5,
        network: NETWORK,
      }),
    ).toThrow(/exceeds available rune balance/);
  });
});

describe("buildWithdrawTransaction (C2)", () => {
  test("moves RT user→Vault and BTC Buffer→user; full redemption emits no rune change", () => {
    const userRt: RuneUtxo = {
      txid: txid(2), vout: 0, value: 1_000, scriptPubKey: investor.scriptHex, runeAmount: 400_000n,
    };
    const res = buildWithdrawTransaction({
      rune,
      userRtInputs: [userRt],
      rtAmount: 400_000n,
      vaultRtAddress: vault.address,
      userRtChangeAddress: investor.address,
      bufferBtcInputs: [{ txid: txid(4), vout: 2, value: 100_000, scriptPubKey: buffer.scriptHex }],
      btcAmount: 95_000,
      userBtcAddress: investor.address,
      bufferBtcChangeAddress: buffer.address,
      feeRate: 5,
      network: NETWORK,
    });

    // No rune change output for a full redemption.
    expect(res.outputs.map((o) => o.role)).toEqual([
      "rt recipient",
      "btc recipient",
      "runestone",
      "btc change",
    ]);
    expect(res.runeChange).toBe(0n);

    const decoded = nativeRunestoneCodec.decipher(Buffer.from(res.runestoneScriptHex, "hex"));
    expect(decoded.runestone.edicts).toEqual([{ id: rune.id, amount: 400_000n, output: 0 }]);
    expect(decoded.runestone.pointer).toBe(0);
  });

  test("throws when the Buffer cannot cover the payout + fee", () => {
    expect(() =>
      buildWithdrawTransaction({
        rune,
        userRtInputs: [{ txid: txid(2), vout: 0, value: 1_000, scriptPubKey: investor.scriptHex, runeAmount: 400_000n }],
        rtAmount: 400_000n,
        vaultRtAddress: vault.address,
        userRtChangeAddress: investor.address,
        bufferBtcInputs: [{ txid: txid(4), vout: 2, value: 10_000, scriptPubKey: buffer.scriptHex }],
        btcAmount: 95_000,
        userBtcAddress: investor.address,
        feeRate: 5,
        network: NETWORK,
      }),
    ).toThrow(/insufficient BTC/);
  });
});
