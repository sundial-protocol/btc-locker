# Sundial OP_RETURN Metadata Specification

Sundial embeds a 60-byte metadata payload in an `OP_RETURN` output on every protocol transaction. This document is the canonical reference for encoding and decoding that payload.

## Binary Layout

All multi-byte integers are **big-endian**. Total size: **60 bytes**.

| Offset | Size | Field                 | Type   | Description                            |
| ------ | ---- | --------------------- | ------ | -------------------------------------- |
| 0      | 4    | `magic`               | ASCII  | Protocol identifier. Must be `"SNDL"`. |
| 4      | 1    | `version`             | uint8  | Schema version. Currently `0x01`.      |
| 5      | 1    | `txType`              | uint8  | Transaction type tag (see below).      |
| 6      | 16   | `subjectId`           | bytes  | UUID v4 in raw bytes (no dashes).      |
| 22     | 32   | `providerXonlyPubkey` | bytes  | Yield-provider's x-only public key.    |
| 54     | 2    | `flags`               | uint16 | Reserved flags. Default `0x0000`.      |
| 56     | 4    | `checksum`            | uint32 | CRC-32 (IEEE 802.3) over bytes 0–55.   |

### Transaction Types

| Value  | Name           | Usage                                            |
| ------ | -------------- | ------------------------------------------------ |
| `0x01` | `Deposit`      | User deposits BTC into escrow + timelock.        |
| `0x02` | `Claim`        | Provider withdraws yield from escrow.            |
| `0x03` | `Distribution` | Provider distributes yield to a timelock.        |
| `0x04` | `Withdrawal`   | User withdraws principal from escrow + timelock. |

### Field Details

**`subjectId`** — A UUID v4 identifying the deposit. Stored as 16 raw bytes on-chain. When represented in code, the canonical dashed string format is used (e.g. `"550e8400-e29b-41d4-a716-446655440000"`). Dashes are stripped before packing and re-inserted after unpacking.

**`providerXonlyPubkey`** — The 32-byte x-only public key of the yield provider. Represented as a 64-character hex string in the `SundialMetadata` interface. To derive from a compressed public key (33 bytes), strip the first byte (`02`/`03` prefix).

**`checksum`** — CRC-32 (polynomial `0xEDB88320`) computed over bytes 0 through 55 inclusive. Verified on decode; a mismatch throws a `ValidationError`.

## TypeScript Interface

```ts
interface SundialMetadata {
  magic: string; // "SNDL"
  version: number; // 0x01
  txType: TxType; // 0x01–0x04
  subjectId: string; // UUID v4 with dashes
  providerXonlyPubkey: string; // 64 hex chars
  flags: number; // 0x0000–0xFFFF
}
```

## Encoding (Packing)

`MetadataUtils.pack(metadata)` validates all fields and returns a 60-byte `Buffer`.

```ts
import MetadataUtils, { TxType } from "./utils/metadata";

const buf = MetadataUtils.pack({
  magic: "SNDL",
  version: 1,
  txType: TxType.Deposit,
  subjectId: "550e8400-e29b-41d4-a716-446655440000",
  providerXonlyPubkey: "ab12cd...".padEnd(64, "0"), // 64 hex chars
  flags: 0,
});
// buf.length === 60
```

`MetadataUtils.pack_string(s)` accepts either a JSON string or a 120-character hex string and returns the same 60-byte `Buffer`. Useful when metadata arrives as a serialized value from an API or CLI.

```ts
// From JSON
const buf = MetadataUtils.pack_string(
  JSON.stringify({
    txType: 1,
    subjectId: "550e8400-e29b-41d4-a716-446655440000",
    providerXonlyPubkey: "a".repeat(64),
  }),
);

// From hex (round-tripped)
const buf2 = MetadataUtils.pack_string(buf.toString("hex"));
```

## Decoding (Unpacking)

`MetadataUtils.unpack(buf)` validates magic, version, txType, and checksum, then returns a `SundialMetadata` object.

```ts
const meta = MetadataUtils.unpack(opReturnData);
// meta.subjectId   → "550e8400-e29b-41d4-a716-446655440000"
// meta.txType      → TxType.Deposit (0x01)
// meta.providerXonlyPubkey → "ab12cd..."
```

## Attaching Metadata to a Transaction

`MetadataUtils.toOutput(metadata)` packs the metadata and wraps it in an `OP_RETURN` output with value `0`.

```ts
// From a SundialMetadata object
psbt.addOutput(
  MetadataUtils.toOutput({
    magic: "SNDL",
    version: 1,
    txType: TxType.Distribution,
    subjectId: "6e578f1c-fd1d-48be-ba29-61f5aadc27d7",
    providerXonlyPubkey: xOnlyPubkey,
    flags: 0,
  }),
);

// From a JSON or hex string
psbt.addOutput(MetadataUtils.toOutput(metadataJsonString));
```

The returned object has the shape `{ script: Buffer, value: BigInt(0) }` and is added as the last output of the transaction.

## Usage in Protocol Transactions

### Deposit

When a user deposits BTC, the CLI auto-generates a `subjectId` if not provided and derives the provider pubkey from the `--provider-pubkey` flag. The metadata is attached to the staking transaction as an `OP_RETURN` output alongside the escrow, timelock, and change outputs.

```ts
const metadata = {
  magic: "SNDL",
  version: 1,
  txType: TxType.Deposit,
  subjectId: crypto.randomUUID(),
  providerXonlyPubkey: providerPubkey,
  flags: 0,
};
const psbt = await locker.createDepositTransaction({
  inputs,
  escrowAddress,
  escrowAmount,
  timelockAddress,
  timelockAmount,
  changeAddress,
  metadata,
});
```

### Distribution (Yield Payout)

The provider distributes yield to a user's timelock address. The provider's x-only pubkey is derived from their signing key.

```ts
const providerPubkey = KeyUtils.toXOnly(keyPair.publicKey); // strips prefix byte
const psbt = await locker.createDistributionTransaction({
  inputs,
  timelockAddress,
  amount,
  metadata: {
    magic: "SNDL",
    version: 1,
    txType: TxType.Distribution,
    subjectId,
    providerXonlyPubkey: providerPubkey,
    flags: 0,
  },
});
```

### Withdrawal

Same structure as above with `txType` set to `TxType.Claim` (`0x02`) or `TxType.Withdrawal` (`0x04`) respectively.

### Example Transactions

Example transactions can be found here:

- [0x01: Deposit](https://mempool.space/testnet/tx/3a673e2b13aedae92bbe2589dcb161856aa26d86abc9e33541c8bf95ecf277c9)
- [0x02: Claim](https://mempool.space/testnet/tx/53fc2d443872e5818a5e0b10011620a3baa1d51a727bf103271bf24b36d9af0c)
- [0x03: Distribution](https://mempool.space/testnet/tx/435742c80b0ea67fbaea1fa28ce59079ebf47447dc3e61f76bbda6c74f029676)
- [0x04: Withdrawal](https://mempool.space/testnet/tx/87cc2463cc68030830b3c07141973f63d46a7df637a17b60b8d8d39c6490485b)

## Decoding from a Raw Transaction

`MetadataUtils.isSundialMetadata(buf)` is a fast check that only tests whether the first 4 bytes match a valid magic string. It does not verify the checksum or any other field. Use it to filter candidate outputs before calling `unpack`:

```ts
const tx = bitcoin.Transaction.fromHex(rawHex);
for (const out of tx.outs) {
  const chunks = bitcoin.script.decompile(out.script);
  if (
    chunks &&
    chunks[0] === bitcoin.opcodes.OP_RETURN &&
    Buffer.isBuffer(chunks[1])
  ) {
    if (MetadataUtils.isSundialMetadata(chunks[1])) {
      const meta = MetadataUtils.unpack(chunks[1]); // full validation + decode
      console.log(meta.txType, meta.subjectId);
    }
  }
}
```

## Validation Rules

Encoding and decoding both enforce these constraints:

| Field                 | Constraint                                        |
| --------------------- | ------------------------------------------------- |
| `magic`               | Must be `"SNDL"`                                  |
| `version`             | Must be `0x01`                                    |
| `txType`              | Must be `0x01`–`0x04`                             |
| `subjectId`           | Valid 32-hex-char UUID (dashes optional on input) |
| `providerXonlyPubkey` | Exactly 64 lowercase/uppercase hex characters     |
| `flags`               | `0x0000`–`0xFFFF`                                 |
| `checksum`            | CRC-32 must match on decode                       |

Any violation throws a `ValidationError`.
