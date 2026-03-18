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
