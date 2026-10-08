import { describe, test, expect } from "vitest";
import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import ecc from "@bitcoinerlab/secp256k1";
import {
  ETCH_COMMIT_CONFIRMATIONS,
  buildEtchCommitTransaction,
  commitmentLeafScript,
  createEtchCommitment,
} from "../src/tx/etch-commit";
import { buildEtchTransaction } from "../src/tx/etch";
import { nativeRunestoneCodec } from "../src/runes/native-codec";
import { runeCommitment, runeNameToNumber } from "../src/runes/rune-name";
import type { ReceiptRune } from "../src/receipt/receipt-rune";
import vectors from "./vectors/ord-runestones.json";
import { NETWORK, p2wpkh, txid } from "./helpers";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const rune: ReceiptRune = {
  name: "SOLSTICERECEIPT",
  displayTicker: "RT",
  divisibility: 8,
  symbol: 0x24,
  spacers: 128,
  totalSupply: 2_100_000_000_000_000n,
};

const admin = ECPair.fromPrivateKey(Buffer.alloc(32, 7), { network: NETWORK });
const adminXOnly = Buffer.from(admin.publicKey.subarray(1));
const vault = p2wpkh(1);
const funding = p2wpkh(2);

/** The data pushes of a script, read the way ord reads a tapscript. */
function pushes(script: Uint8Array): string[] {
  const out: string[] = [];
  for (let i = 0; i < script.length; ) {
    const op = script[i++];
    if (op <= 0x4b) {
      out.push(Buffer.from(script.subarray(i, i + op)).toString("hex"));
      i += op;
    } else if (op === 0x4c) {
      const n = script[i++];
      out.push(Buffer.from(script.subarray(i, i + n)).toString("hex"));
      i += n;
    }
  }
  return out;
}

describe("createEtchCommitment", () => {
  test("is a taproot output whose leaf pushes the commitment ord expects", () => {
    const c = createEtchCommitment(rune, adminXOnly, NETWORK);
    const commitment = vectors.runeNames.find((v) => v.name === rune.name)!.commitment;

    expect(c.scriptPubKeyHex).toMatch(/^5120[0-9a-f]{64}$/);
    expect(c.address.startsWith("tb1p")).toBe(true);
    // <key> OP_CHECKSIG OP_FALSE OP_IF <9-byte commitment> OP_ENDIF
    expect(c.tapLeafScriptHex).toBe(
      `20${adminXOnly.toString("hex")}ac006309${commitment}68`,
    );
    expect(pushes(Buffer.from(c.tapLeafScriptHex, "hex"))).toContain(commitment);
    // Control block: leaf version and parity, then the internal key. One leaf, no path.
    expect(c.controlBlockHex.slice(2)).toBe(adminXOnly.toString("hex"));
    expect(Number.parseInt(c.controlBlockHex.slice(0, 2), 16) & 0xfe).toBe(0xc0);
  });

  test("accepts a compressed key and gives the same output", () => {
    expect(createEtchCommitment(rune, admin.publicKey, NETWORK)).toEqual(
      createEtchCommitment(rune, adminXOnly.toString("hex"), NETWORK),
    );
  });

  test("differs per rune name", () => {
    const other = createEtchCommitment({ name: "SOLSTICERECEIPU" }, adminXOnly, NETWORK);
    expect(other.address).not.toBe(createEtchCommitment(rune, adminXOnly, NETWORK).address);
  });

  test("writes a one-byte commitment as a data push, not OP_N", () => {
    // "F" is rune 5: a script compiler would emit OP_5, which ord does not match.
    const c = createEtchCommitment({ name: "F" }, adminXOnly, NETWORK);
    expect(runeCommitment(runeNameToNumber("F")).toString("hex")).toBe("05");
    expect(c.tapLeafScriptHex.endsWith("ac0063010568")).toBe(true);
  });

  test("writes 0x81 as a data push, not OP_1NEGATE", () => {
    const leaf = commitmentLeafScript(adminXOnly, Buffer.from([0x81]));
    expect(leaf.toString("hex").endsWith("ac0063018168")).toBe(true);
  });

  test("the longest name has a 16-byte commitment, the largest allowed", () => {
    const longest = vectors.runeNames.find((v) => v.commitment.length === 32)!;
    const c = createEtchCommitment({ name: longest.name }, adminXOnly, NETWORK);
    expect(c.tapLeafScriptHex.endsWith(`ac006310${longest.commitment}68`)).toBe(true);
  });

  test("an empty commitment (rune A) is pushed as a zero byte", () => {
    const c = createEtchCommitment({ name: "A" }, adminXOnly, NETWORK);
    expect(c.tapLeafScriptHex.endsWith("ac00630068")).toBe(true);
  });

  test("refuses a commitment longer than 16 bytes", () => {
    expect(() => commitmentLeafScript(adminXOnly, Buffer.alloc(17))).toThrow(/at most 16 bytes/);
  });

  test("refuses a leaf key that is not x-only", () => {
    expect(() => commitmentLeafScript(Buffer.alloc(33, 2), Buffer.alloc(4))).toThrow(/x-only/);
  });

  test("rejects a key of the wrong length", () => {
    expect(() => createEtchCommitment(rune, Buffer.alloc(20), NETWORK)).toThrow(/x-only/);
  });
});

describe("buildEtchCommitTransaction (C0, commit)", () => {
  const inputs = [{ txid: txid(2), vout: 0, value: 100_000, scriptPubKey: funding.scriptHex }];

  test("pays the commitment at output 0, sized to fund the reveal", () => {
    const res = buildEtchCommitTransaction({
      rune,
      revealPublicKey: adminXOnly,
      inputs,
      changeAddress: funding.address,
      feeRate: 5,
      network: NETWORK,
    });

    expect(res.outputs.map((o) => o.role)).toEqual(["etch commit", "btc change"]);
    expect(res.commitVout).toBe(0);
    expect(res.commitment).toEqual(createEtchCommitment(rune, adminXOnly, NETWORK));
    expect(100_000).toBe(res.commitOutputValue + res.fee + res.changeSats);

    const psbt = bitcoin.Psbt.fromBase64(res.psbtBase64, { network: NETWORK });
    expect(Buffer.from(psbt.txOutputs[0].script).toString("hex")).toBe(
      res.commitment.scriptPubKeyHex,
    );
    expect(psbt.txOutputs[0].value).toBe(BigInt(res.commitOutputValue));

    // The default value lets the reveal run with no other input.
    const reveal = buildEtchTransaction({
      rune,
      vaultAddress: vault.address,
      commit: { txid: txid(3), vout: 0, value: res.commitOutputValue, revealPublicKey: adminXOnly },
      feeRate: 5,
      network: NETWORK,
    });
    expect(reveal.fee).toBe(res.commitOutputValue - 546);
  });

  test("honours an explicit commit output value", () => {
    const res = buildEtchCommitTransaction({
      rune,
      revealPublicKey: adminXOnly,
      commitOutputValue: 20_000,
      inputs,
      changeAddress: funding.address,
      feeRate: 5,
      network: NETWORK,
    });
    expect(res.commitOutputValue).toBe(20_000);
  });

  test("throws on insufficient funds", () => {
    expect(() =>
      buildEtchCommitTransaction({
        rune,
        revealPublicKey: adminXOnly,
        inputs: [{ ...inputs[0], value: 1_000 }],
        feeRate: 5,
        network: NETWORK,
      }),
    ).toThrow(/insufficient/);
  });

  test("six confirmations, as ord requires", () => {
    expect(ETCH_COMMIT_CONFIRMATIONS).toBe(6);
  });
});

describe("buildEtchTransaction (C0, reveal)", () => {
  const commit = { txid: txid(3), vout: 0, value: 10_000, revealPublicKey: adminXOnly };

  test("premines full supply to the vault and points at it", () => {
    const res = buildEtchTransaction({
      rune,
      vaultAddress: vault.address,
      commit,
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

    // The runestone is byte for byte the one ord enciphers for this etching.
    expect(res.runestoneScriptHex).toBe(vectors.encipher[0].scriptPubKey);
    const decoded = nativeRunestoneCodec.decipher(Buffer.from(res.runestoneScriptHex, "hex"));
    expect(decoded.cenotaph).toBe(false);
    expect(decoded.runestone.etching?.rune).toBe(runeNameToNumber("SOLSTICERECEIPT"));
    expect(decoded.runestone.etching?.premine).toBe(rune.totalSupply);
    expect(decoded.runestone.pointer).toBe(0);

    // Change conserves value: in = vault + fee + change.
    expect(110_000).toBe(546 + res.fee + res.changeSats);

    // The PSBT parses and its OP_RETURN output matches the runestone.
    const psbt = bitcoin.Psbt.fromBase64(res.psbtBase64, { network: NETWORK });
    expect(psbt.txInputs.length).toBe(2);
    expect(psbt.txOutputs.length).toBe(3);
    expect(Buffer.from(psbt.txOutputs[1].script).toString("hex")).toBe(res.runestoneScriptHex);
    expect(psbt.txOutputs[1].value).toBe(0n);
  });

  test("input 0 spends the commit output by script path and reveals the commitment", () => {
    const res = buildEtchTransaction({
      rune,
      vaultAddress: vault.address,
      commit,
      feeRate: 5,
      network: NETWORK,
    });
    const commitment = createEtchCommitment(rune, adminXOnly, NETWORK);

    const psbt = bitcoin.Psbt.fromBase64(res.psbtBase64, { network: NETWORK });
    expect(psbt.txInputs.length).toBe(1);
    expect(Buffer.from(psbt.txInputs[0].hash).reverse().toString("hex")).toBe(commit.txid);
    const input = psbt.data.inputs[0];
    expect(Buffer.from(input.witnessUtxo!.script).toString("hex")).toBe(
      commitment.scriptPubKeyHex,
    );
    expect(Buffer.from(input.tapLeafScript![0].script).toString("hex")).toBe(
      commitment.tapLeafScriptHex,
    );

    // Signed and finalized, the witness is [signature, tapscript, control block].
    // ord takes the second-to-last element as the tapscript and scans its pushes.
    psbt.signInput(0, admin);
    psbt.finalizeAllInputs();
    const witness = psbt.extractTransaction().ins[0].witness;
    expect(witness.length).toBe(3);
    expect(witness[0].length).toBe(64);
    expect(Buffer.from(witness[2]).toString("hex")).toBe(commitment.controlBlockHex);
    expect(pushes(witness[1])).toContain(
      runeCommitment(runeNameToNumber(rune.name)).toString("hex"),
    );

    // No change output: the whole remainder is the fee.
    expect(res.outputs.map((o) => o.role)).toEqual(["vault (premine)", "runestone"]);
    expect(res.changeSats).toBe(0);
    expect(res.fee).toBe(commit.value - 546);
  });

  test("omits change when it would be sub-dust", () => {
    const res = buildEtchTransaction({
      rune,
      vaultAddress: vault.address,
      commit: { ...commit, value: 2_300 },
      changeAddress: funding.address,
      feeRate: 5,
      network: NETWORK,
    });
    expect(res.outputs.map((o) => o.role)).toEqual(["vault (premine)", "runestone"]);
    expect(res.changeSats).toBe(0);
    expect(res.fee).toBe(2_300 - 546);
  });

  test("throws on insufficient funds", () => {
    expect(() =>
      buildEtchTransaction({
        rune,
        vaultAddress: vault.address,
        commit: { ...commit, value: 600 },
        feeRate: 5,
        network: NETWORK,
      }),
    ).toThrow(/insufficient/);
  });
});
