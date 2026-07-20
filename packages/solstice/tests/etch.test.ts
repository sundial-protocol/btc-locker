import { describe, test, expect } from "vitest";
import * as bitcoin from "bitcoinjs-lib";
import { buildEtchTransaction } from "../src/tx/etch";
import { nativeRunestoneCodec } from "../src/runes/native-codec";
import { runeNameToNumber } from "../src/runes/rune-name";
import type { ReceiptRune } from "../src/receipt/receipt-rune";
import { NETWORK, p2wpkh, txid } from "./helpers";

const rune: ReceiptRune = {
  name: "SUNDIALQBTC",
  displayTicker: "qBTC",
  id: { block: 840000n, tx: 7n },
  divisibility: 8,
  symbol: 0x71,
  totalSupply: 2_100_000_000_000_000n,
};

describe("buildEtchTransaction (C0)", () => {
  const vault = p2wpkh(1);
  const funding = p2wpkh(2);

  test("premines full supply to the vault and points at it", () => {
    const res = buildEtchTransaction({
      rune,
      vaultAddress: vault.address,
      inputs: [{ txid: txid(2), vout: 0, value: 100_000, scriptPubKey: funding.scriptHex }],
      changeAddress: funding.address,
      feeRate: 5,
      network: NETWORK,
    });

    // Output shape: vault, runestone, change.
    expect(res.outputs.map((o) => o.role)).toEqual([
      "vault (premine)",
      "runestone",
      "btc change",
    ]);

    // Runestone decodes to the etching with the full premine and pointer 0.
    const decoded = nativeRunestoneCodec.decipher(Buffer.from(res.runestoneScriptHex, "hex"));
    expect(decoded.cenotaph).toBe(false);
    expect(decoded.runestone.etching?.rune).toBe(runeNameToNumber("SUNDIALQBTC"));
    expect(decoded.runestone.etching?.premine).toBe(rune.totalSupply);
    expect(decoded.runestone.pointer).toBe(0);

    // Change conserves value: in = vault + fee + change.
    expect(100_000).toBe(546 + res.fee + res.changeSats);

    // The PSBT parses and its OP_RETURN output matches the runestone.
    const psbt = bitcoin.Psbt.fromBase64(res.psbtBase64, { network: NETWORK });
    expect(psbt.txOutputs.length).toBe(3);
    expect(Buffer.from(psbt.txOutputs[1].script).toString("hex")).toBe(res.runestoneScriptHex);
    expect(psbt.txOutputs[1].value).toBe(0n);
  });

  test("omits change when it would be sub-dust", () => {
    // Fund with barely more than vault + fee so change < 546.
    const res = buildEtchTransaction({
      rune,
      vaultAddress: vault.address,
      inputs: [{ txid: txid(2), vout: 0, value: 2_000, scriptPubKey: funding.scriptHex }],
      changeAddress: funding.address,
      feeRate: 5,
      network: NETWORK,
    });
    expect(res.outputs.map((o) => o.role)).toEqual(["vault (premine)", "runestone"]);
    expect(res.changeSats).toBe(0);
  });

  test("throws on insufficient funds", () => {
    expect(() =>
      buildEtchTransaction({
        rune,
        vaultAddress: vault.address,
        inputs: [{ txid: txid(2), vout: 0, value: 500, scriptPubKey: funding.scriptHex }],
        feeRate: 5,
        network: NETWORK,
      }),
    ).toThrow(/insufficient/);
  });
});
