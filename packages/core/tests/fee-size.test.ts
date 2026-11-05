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

/** A signature by `key`. Only its length matters here, which varies by key. */
function sign(key: ECPairInterface): Uint8Array {
  return bitcoin.script.signature.encode(
    key.sign(Buffer.alloc(32, 7)),
    bitcoin.Transaction.SIGHASH_ALL,
  );
}

/** A transaction with these inputs' scriptSigs and witnesses, to `outputs`. */
function built(
  inputs: { scriptSig?: Uint8Array; witness?: Uint8Array[] }[],
  outputs: Uint8Array[],
): bitcoin.Transaction {
  const tx = new bitcoin.Transaction();
  tx.version = 2;
  inputs.forEach((input, n) => {
    tx.addInput(Buffer.alloc(32, n + 1), 0, undefined, input.scriptSig);
    if (input.witness) tx.setWitness(n, input.witness);
  });
  for (const script of outputs) tx.addOutput(script, 10_000n);
  return tx;
}

/** A single-key timelock script, as the locker writes one. */
const timelock = (key: ECPairInterface) =>
  bitcoin.script.compile([
    bitcoin.script.number.encode(900_000),
    bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
    bitcoin.opcodes.OP_DROP,
    key.publicKey,
    bitcoin.opcodes.OP_CHECKSIG,
  ]);

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

  test("P2WSH 2-of-3 multisig: two signatures and the empty item, at most 1 vB over", () => {
    const script = (key: ECPairInterface) =>
      bitcoin.payments.p2ms({
        m: 2,
        pubkeys: [key.publicKey, keys[1].publicKey, keys[2].publicKey],
      }).output!;
    const outputs = [p2wpkh(keys[0])];
    const diffs = overshoot(
      (key) => ({
        scriptPubKey: bitcoin.payments.p2wsh({ redeem: { output: script(key) } }).output!,
        witnessScript: script(key),
      }),
      outputs,
      (key) =>
        built(
          [{ witness: [new Uint8Array(), sign(key), sign(keys[1]), script(key)] }],
          outputs,
        ),
    );
    expect(Math.min(...diffs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...diffs)).toBeLessThanOrEqual(1);
  });

  test("P2WSH with a signature check in each of two nested branches counts the costliest path", () => {
    // IF <a> CHECKSIGVERIFY IF <b> CHECKSIG ELSE <c> CHECKSIG ENDIF ELSE <d> CHECKSIG ENDIF:
    // the first path needs two signatures and two selectors.
    const script = bitcoin.script.compile([
      bitcoin.opcodes.OP_IF,
      keys[0].publicKey,
      bitcoin.opcodes.OP_CHECKSIGVERIFY,
      bitcoin.opcodes.OP_IF,
      keys[1].publicKey,
      bitcoin.opcodes.OP_CHECKSIG,
      bitcoin.opcodes.OP_ELSE,
      keys[2].publicKey,
      bitcoin.opcodes.OP_CHECKSIG,
      bitcoin.opcodes.OP_ENDIF,
      bitcoin.opcodes.OP_ELSE,
      keys[3].publicKey,
      bitcoin.opcodes.OP_CHECKSIG,
      bitcoin.opcodes.OP_ENDIF,
    ]);
    const outputs = [p2wpkh(keys[0])];
    const input = {
      scriptPubKey: bitcoin.payments.p2wsh({ redeem: { output: script } }).output!,
      witnessScript: script,
    };
    const tx = built(
      [{ witness: [sign(keys[1]), Buffer.from([1]), sign(keys[0]), Buffer.from([1]), script] }],
      outputs,
    );
    const diff = FeeUtils.estimateVsize([input], outputs) - tx.virtualSize();
    expect(diff).toBeGreaterThanOrEqual(0);
    expect(diff).toBeLessThanOrEqual(1);
  });

  test("P2SH-P2WSH: the redeem script in the scriptSig and the witness as P2WSH", () => {
    const outputs = [p2wpkh(keys[0])];
    const diffs = overshoot(
      (key) => {
        const p2sh = bitcoin.payments.p2sh({
          redeem: bitcoin.payments.p2wsh({ redeem: { output: timelock(key) } }),
        });
        return {
          scriptPubKey: p2sh.output!,
          redeemScript: p2sh.redeem!.output!,
          witnessScript: timelock(key),
        };
      },
      outputs,
      (key) => {
        const redeem = bitcoin.payments.p2wsh({ redeem: { output: timelock(key) } }).output!;
        return built(
          [
            {
              scriptSig: bitcoin.script.compile([redeem]),
              witness: [sign(key), timelock(key)],
            },
          ],
          outputs,
        );
      },
    );
    expect(Math.min(...diffs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...diffs)).toBeLessThanOrEqual(1);
  });

  // Legacy inputs carry their signatures in non-witness bytes, which cost four
  // times as much, so a real signature a byte or three short of the budget
  // moves the size by whole vbytes. These tests use the longest signature
  // (73 bytes) and check the estimate is within 1 vB of it.
  const LONGEST = Buffer.alloc(73, 0x30);

  test("legacy P2SH: the signature and redeem script in the scriptSig", () => {
    const outputs = [p2wpkh(keys[0])];
    const diffs = overshoot(
      (key) => ({
        scriptPubKey: bitcoin.payments.p2sh({ redeem: { output: timelock(key) } }).output!,
        redeemScript: timelock(key),
      }),
      outputs,
      (key) =>
        built([{ scriptSig: bitcoin.script.compile([LONGEST, timelock(key)]) }], outputs),
    );
    expect(Math.min(...diffs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...diffs)).toBeLessThanOrEqual(1);
  });

  test("legacy P2SH 2-of-3 multisig: OP_0 and two signatures", () => {
    const redeem = bitcoin.payments.p2ms({
      m: 2,
      pubkeys: [keys[0].publicKey, keys[1].publicKey, keys[2].publicKey],
    }).output!;
    const input = {
      scriptPubKey: bitcoin.payments.p2sh({ redeem: { output: redeem } }).output!,
      redeemScript: redeem,
    };
    const outputs = [p2wpkh(keys[0])];
    const tx = built(
      [{ scriptSig: bitcoin.script.compile([bitcoin.opcodes.OP_0, LONGEST, LONGEST, redeem]) }],
      outputs,
    );
    const diff = FeeUtils.estimateVsize([input], outputs) - tx.virtualSize();
    expect(diff).toBeGreaterThanOrEqual(0);
    expect(diff).toBeLessThanOrEqual(1);
  });

  test("P2PKH: an uncompressed key is assumed unless the key is given", () => {
    const ECPair = ECPairFactory((tinysecp as any).default || tinysecp);
    const outputs = [p2wpkh(keys[0])];
    const p2pkhOf = (key: ECPairInterface) =>
      bitcoin.payments.p2pkh({ pubkey: key.publicKey, network }).output!;
    const spend = (key: ECPairInterface) =>
      built([{ scriptSig: bitcoin.script.compile([LONGEST, key.publicKey]) }], outputs);
    const diff = (input: SizedInput, key: ECPairInterface) =>
      FeeUtils.estimateVsize([input], outputs) - spend(key).virtualSize();

    const uncompressed = ECPair.makeRandom({ network, compressed: false });
    expect(diff({ scriptPubKey: p2pkhOf(uncompressed) }, uncompressed)).toBeGreaterThanOrEqual(0);
    expect(diff({ scriptPubKey: p2pkhOf(uncompressed) }, uncompressed)).toBeLessThanOrEqual(1);

    const compressed = keys[0];
    const given = { scriptPubKey: p2pkhOf(compressed), publicKey: compressed.publicKey };
    expect(diff(given, compressed)).toBeGreaterThanOrEqual(0);
    expect(diff(given, compressed)).toBeLessThanOrEqual(1);
    // Without the key, a compressed one is overpaid by the 32 bytes it lacks.
    expect(diff({ scriptPubKey: p2pkhOf(compressed) }, compressed)).toBe(
      diff(given, compressed) + 32,
    );
  });

  test("a legacy input beside a segwit one counts its empty witness", () => {
    const key = keys[0];
    const outputs = [p2wpkh(key)];
    const inputs = [
      { scriptPubKey: p2wpkh(key) },
      {
        scriptPubKey: bitcoin.payments.p2pkh({ pubkey: key.publicKey, network }).output!,
        publicKey: key.publicKey,
      },
    ];
    const tx = built(
      [
        { witness: [LONGEST, key.publicKey] },
        { scriptSig: bitcoin.script.compile([LONGEST, key.publicKey]) },
      ],
      outputs,
    );
    // Exact in weight units: version, counts and locktime (40), marker and
    // flag (2), then each input and output.
    const weight =
      40 +
      2 +
      inputs.reduce((sum, input) => sum + FeeUtils.inputWeight(input), 0) +
      outputs.reduce((sum, script) => sum + FeeUtils.outputWeight(script), 0);
    expect(weight).toBe(tx.weight());
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
