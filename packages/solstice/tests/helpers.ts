import * as bitcoin from "bitcoinjs-lib";

/** Test network (bech32 "tb"). */
export const NETWORK = bitcoin.networks.testnet;

/**
 * Derive a deterministic, valid testnet P2WPKH address + scriptPubKey from a tag,
 * without needing ECC: a witness-v0 program is just `OP_0 <20-byte hash>`, and
 * bech32 encode/decode of that program needs no curve math.
 */
export function p2wpkh(tag: number): { address: string; script: Buffer; scriptHex: string } {
  const hash = Buffer.alloc(20, tag);
  const script = Buffer.concat([Buffer.from([0x00, 0x14]), hash]);
  const address = bitcoin.address.fromOutputScript(script, NETWORK);
  return { address, script, scriptHex: script.toString("hex") };
}

/** A fake 32-byte txid built from a tag byte. */
export function txid(tag: number): string {
  return Buffer.alloc(32, tag).toString("hex");
}
