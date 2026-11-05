/**
 * FeeUtils' size estimate against transactions bitcoinjs-lib serializes, with
 * real signatures where the size depends on them.
 */
import { describe, test, expect, beforeAll } from "vitest";
import * as bitcoin from "bitcoinjs-lib";
import tinysecp from "@bitcoinerlab/secp256k1";
import { ECPairFactory, type ECPairInterface } from "ecpair";
import FeeUtils, { type SizedInput } from "../src/utils/fees";

/** An OP_RETURN like the metadata output: 60 bytes of data. */
const opReturn = bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, Buffer.alloc(60)]);

const network = bitcoin.networks.regtest;
let keys: ECPairInterface[];

beforeAll(() => {
  const ecc = (tinysecp as any).default || tinysecp;
  bitcoin.initEccLib(ecc);
  const ECPair = ECPairFactory(ecc);
  // Several keys, so signatures of every DER length turn up.
  keys = Array.from({ length: 40 }, () => ECPair.makeRandom({ network }));
});

/** A one-input transaction to `outputs`, with the witness `witness` builds from a signature. */
function signed(
  key: ECPairInterface,
  prevScript: Uint8Array,
  outputs: Uint8Array[],
  witness: (signature: Uint8Array) => Uint8Array[],
): bitcoin.Transaction {
  const tx = new bitcoin.Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, 1), 0);
  for (const script of outputs) tx.addOutput(script, 10_000n);
  const hash = tx.hashForWitnessV0(0, prevScript, 50_000n, bitcoin.Transaction.SIGHASH_ALL);
  const signature = bitcoin.script.signature.encode(
    key.sign(Buffer.from(hash)),
    bitcoin.Transaction.SIGHASH_ALL,
  );
  tx.setWitness(0, witness(signature));
  return tx;
}

/** Estimate minus real vsize, for each key. */
function overshoot(
  input: (key: ECPairInterface) => SizedInput,
  outputs: Uint8Array[],
  build: (key: ECPairInterface) => bitcoin.Transaction,
): number[] {
  return keys.map(
    (key) => FeeUtils.estimateVsize([input(key)], outputs) - build(key).virtualSize(),
  );
}

const p2wpkh = (key: ECPairInterface) =>
  bitcoin.payments.p2wpkh({ pubkey: key.publicKey, network }).output!;

describe("FeeUtils.estimateVsize", () => {
  test("P2WPKH: never short, and at most 1 vB over", () => {
    const outputs = [p2wpkh(keys[0])];
    const diffs = overshoot(
      (key) => ({ scriptPubKey: p2wpkh(key) }),
      outputs,
      (key) =>
        signed(key, bitcoin.payments.p2pkh({ pubkey: key.publicKey }).output!, outputs, (sig) => [
          sig,
          key.publicKey,
        ]),
    );
    expect(Math.min(...diffs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...diffs)).toBeLessThanOrEqual(1);
  });

  for (const [name, branch] of [
    ["P2WSH escrow (IF/ELSE, branch selector)", true],
    ["P2WSH timelock (no branch)", false],
  ] as const) {
    test(`${name}: never short, and at most 1 vB over`, () => {
      const script = (key: ECPairInterface) =>
        bitcoin.script.compile(
          branch
            ? [
                bitcoin.opcodes.OP_IF,
                bitcoin.script.number.encode(900_000),
                bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
                bitcoin.opcodes.OP_DROP,
                key.publicKey,
                bitcoin.opcodes.OP_CHECKSIG,
                bitcoin.opcodes.OP_ELSE,
                keys[0].publicKey,
                bitcoin.opcodes.OP_CHECKSIG,
                bitcoin.opcodes.OP_ENDIF,
              ]
            : [
                bitcoin.script.number.encode(900_000),
                bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
                bitcoin.opcodes.OP_DROP,
                key.publicKey,
                bitcoin.opcodes.OP_CHECKSIG,
              ],
        );
      const outputs = [p2wpkh(keys[0]), opReturn];
      const diffs = overshoot(
        (key) => ({
          scriptPubKey: bitcoin.payments.p2wsh({ redeem: { output: script(key) } }).output!,
          witnessScript: script(key),
        }),
        outputs,
        (key) =>
          signed(key, script(key), outputs, (sig) =>
            branch ? [sig, Buffer.from([1]), script(key)] : [sig, script(key)],
          ),
      );
      expect(Math.min(...diffs)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...diffs)).toBeLessThanOrEqual(1);
    });
  }

  test("P2TR key path: at most 1 vB over a 64-byte signature", () => {
    const xOnly = keys[0].publicKey.subarray(1);
    const scriptPubKey = bitcoin.payments.p2tr({ internalPubkey: xOnly, network }).output!;
    const outputs = [p2wpkh(keys[0])];
    const tx = signed(keys[0], scriptPubKey, outputs, () => [Buffer.alloc(64)]);
    const diff = FeeUtils.estimateVsize([{ scriptPubKey }], outputs) - tx.virtualSize();
    expect(diff).toBeGreaterThanOrEqual(0);
    expect(diff).toBeLessThanOrEqual(1);
  });

  test("an output is its script plus 9 bytes", () => {
    const metadata = opReturn;
    expect(metadata.length).toBe(62);
    expect(FeeUtils.outputWeight(metadata)).toBe(4 * (9 + metadata.length));
    expect(FeeUtils.outputWeight(p2wpkh(keys[0]))).toBe(4 * 31);
  });

  test("an unknown input, or P2WSH without its script, counts as 150 vB", () => {
    expect(FeeUtils.inputWeight({ scriptPubKey: new Uint8Array() })).toBe(600);
    expect(FeeUtils.inputWeight({ scriptPubKey: new Uint8Array(34) })).toBe(600);
  });

  test("the fee is the vsize at the rate, rounded up", () => {
    const inputs = [{ scriptPubKey: p2wpkh(keys[0]) }];
    const outputs = [p2wpkh(keys[1])];
    const vsize = FeeUtils.estimateVsize(inputs, outputs);
    expect(vsize).toBe(Math.ceil((42 + 273 + 124) / 4));
    expect(FeeUtils.estimateTransactionFee(inputs, outputs, 2.5)).toBe(Math.ceil(vsize * 2.5));
  });
});
