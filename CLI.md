# BTC Locker CLI Quick Reference

## Testing Against Bitcoin Testnet

### What You Need:

1. **No API Keys Required** - Uses free public APIs:
   - Mempool.space API (default)
   - Blockstream Esplora API
   - BlockCypher API (backup)

2. **Testnet Bitcoin** - Get free testnet coins:
   - https://coinfaucet.eu/en/btc-testnet/
   - https://bitcoinfaucet.uo1.net/
   - https://testnet-faucet.mempool.co/

### Complete Testnet Workflow

1. **Generate a new key pair:**

```bash
btc-locker keygen
# Save the privateKey and address!
```

2. **Fund your address:**
   - Go to https://coinfaucet.eu/en/btc-testnet/
   - Enter your address from step 1
   - Request testnet coins

3. **Check your balance:**

```bash
btc-locker inspect address -a YOUR_ADDRESS
```

4. **Create a timelock script:**

```bash
# Lock for 1 hour from now
FUTURE_TIME=$(node -e "console.log(Math.floor(Date.now()/1000) + 3600)")
btc-locker timelock --time $FUTURE_TIME --pubkey YOUR_PUBLIC_KEY
# Save the script address!
```

5. **Send coins to timelock script:**
   - Use any Bitcoin wallet to send testnet coins to the script address
   - Or use a testnet faucet with the script address

6. **Monitor the timelock:**

```bash
btc-locker inspect time -t $FUTURE_TIME
btc-locker inspect address -a SCRIPT_ADDRESS
```

## Installation

### Install via npm

Setup .npmrc to use the Sundial Protocol package registry:

```bash
# Add these lines to ~/.npmrc (or %USERPROFILE%\.npmrc on Windows)
@sundial-protocol:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=ghp_yourgithubtokenhere
```

Install the CLI globally:

```bash
npm install -g @sundial-protocol/btc-locker
```

Confirm installation:

```bash
btc-locker --version
```

### Run Locally

```bash
npm run cli
```

## Key Generation

```bash
# Testnet (default)
btc-locker keygen

# Mainnet
btc-locker --network mainnet keygen

# JSON output
btc-locker --json keygen
```

## Create Timelock Scripts

### Simple Timelock

```bash
# Using Unix timestamp
btc-locker scripts timelock --time 1765064511 --pubkey 02eb121c6fc425e894a936c87367c3f1871170af9e131cc2aa598d6ae4ee4a1cbe

# Using relative time (requires interactive input due to PowerShell parsing)
btc-locker scripts timelock
# Then enter: "1 week" when prompted
```

## Utilities

```bash
# Check if timelock expired
btc-locker inspect time -t 1765064511

# Validate keys
btc-locker utils validate-key 02eb121c6fc425e894a936c87367c3f1871170af9e131cc2aa598d6ae4ee4a1cbe

# Convert time formats
btc-locker utils time 1765064511
```

## Interactive Mode

```bash
btc-locker interactive
```

## Real-World Example

1. Generate a key pair:

```bash
KEY_DATA=$(btc-locker --json keygen)
PUBKEY=$(echo $KEY_DATA | jq -r .publicKey)
```

2. Create a 1-week timelock:

```bash
FUTURE_TIME=$(($(date +%s) + 604800))  # Current time + 1 week
btc-locker timelock --time $FUTURE_TIME --pubkey $PUBKEY
```

3. Check status later:

```bash
btc-locker check --time $FUTURE_TIME
```

## Solstice (Runes receipt token)

Commands for the Solstice value-accrual vault's receipt-token + atomic-swap layer
(`@sundial-protocol/solstice`). Testnet by default.

### Etch a receipt rune (C0)

Premines the full fixed supply into a vault address. An etching takes **two
transactions**: a commit to the rune name, and the etching itself, which has to
confirm when the commit has 6 confirmations or more. Without the commit, Runes
indexers ignore the etching.

`--from-key` funds both transactions, owns the commit output and signs the
etching. The premine goes to `--vault` (default: the key's own address).

```bash
# Step 1: commit. Add --dry-run first to see the PSBT without broadcasting.
btc-locker solstice etch \
  --from-key YOUR_PRIVATE_KEY \
  --name SOLSTICE.RECEIPT \
  --ticker RT \
  --supply 2100000000000000 \
  --divisibility 8 \
  --symbol q
# prints the commit txid

# Step 2: once the commit has 5 confirmations, the same command plus --commit.
btc-locker solstice etch \
  --from-key YOUR_PRIVATE_KEY \
  --name SOLSTICE.RECEIPT \
  --ticker RT \
  --supply 2100000000000000 \
  --divisibility 8 \
  --symbol q \
  --vault VAULT_ADDRESS \
  --commit COMMIT_TXID
```

Or pass `--wait` in step 1 to keep the command running until the commit has 5
confirmations and then go straight to step 2 (about 50 minutes on mainnet).

Step 2 refuses to build if the commit output does not match the name and key, or
if the commit has fewer than 5 confirmations. An etching that confirms too early
is ignored by indexers and the commit output is spent for nothing.

**Custody.** The key that makes the commit is the only key that can etch: the
commit output is a taproot output locked to it, and the etching decides where the
premine goes. This command takes one private key, so it suits testing. A vault
whose admin is a multisig needs that group to produce one Schnorr signature for
the etching (see `packages/solstice/README.md`).

Rune names are `A–Z`; spacers can be written as `•` or `.` and are display only.
After the etch confirms, its **rune id** is `<blockHeight>:<txIndexInBlock>` —
read it from a Runes explorer and pass it to `solstice swap --rune-id`.

### Atomic swap — invest (C1) / withdraw (C2)

One builder handles both directions; roles are just which side supplies RT vs BTC.
Because rune balances need an indexer to read, you pass the rune-carrying UTXO(s)
explicitly as `txid:vout:value:runeAmount`.

```bash
# Invest: RT Vault→investor, BTC investor→YP
btc-locker solstice swap \
  --rune-id 840000:1 \
  --rt-utxo <vaultRtTxid>:0:1000:1000000 \
  --rt-amount 400000 \
  --rt-to <investorAddress> \
  --rt-change <vaultAddress> \
  --rt-key VAULT_PRIVATE_KEY \
  --btc-utxo <investorBtcTxid>:1:100000 \
  --btc-amount 90000 \
  --btc-to <ypDeploymentAddress> \
  --btc-change <investorAddress> \
  --btc-key INVESTOR_PRIVATE_KEY \
  --dry-run
```

For withdrawal, swap the roles: RT comes from the user, BTC comes from the Buffer.
Provide `--rt-owner` / `--btc-owner` (instead of the keys) to build an unsigned
PSBT for a counterparty to co-sign — the server-submit model. Drop `--dry-run` to
sign (with the provided keys) and broadcast.

### Decode a runestone

Inspect any runestone `OP_RETURN` scriptPubKey and check whether it is a cenotaph:

```bash
btc-locker solstice decode -s 6a5d0b160100c0a2330180b51800
```

### JSON output

All three support the global `--json` flag for machine-readable output, e.g.
`btc-locker --json solstice decode -s <hex>`. In that mode stdout carries exactly
one JSON document, written when the command ends; status lines are dropped, and
prompts and errors go to stderr. `etch` nests its two steps under `commit` and
`etch`. Each built transaction includes `psbtBase64`, and `txid` once it has been
broadcast. A failed run has an `error` field.
