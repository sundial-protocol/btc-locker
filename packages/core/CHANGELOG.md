# @sundial-protocol/btc-locker

## 2.1.1

### Patch Changes

- 1b307ab: Fix two bugs found by the new regtest suite.

  - `signTransaction` gave a plain timelock script an escrow-style witness when the script's bytes (a public key or a locktime) contained `0x63` or `0x64`, and the network rejected the transaction. It now looks at opcodes only.
  - `new BTCLocker(network, api)` and `createBTCLocker(network, api)` now hand `api` to the transaction builders. Before, builders always used a default mempool.space API.

## 2.1.0

### Patch Changes

- receipt token library introduced

## 2.0.5

### Patch Changes

- select api for fee query

## 2.0.4

### Patch Changes

- set api in Locker

## 2.0.3

### Patch Changes

- audit fixes & fees

## 2.0.2

### Patch Changes

- P2WSH script addresses

## 2.0.1

### Patch Changes

- output p2wpkh scripts instead of p2sh scripts

## 2.0.0

### Major Changes

- convert to turborepo w/ changesets
