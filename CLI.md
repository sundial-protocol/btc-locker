# BTC Locker CLI Quick Reference

## Installation
```bash
npm install -g btc-locker
# or run locally:
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
btc-locker timelock --time 1765064511 --pubkey 02eb121c6fc425e894a936c87367c3f1871170af9e131cc2aa598d6ae4ee4a1cbe

# Using relative time (requires interactive input due to PowerShell parsing)
btc-locker timelock
# Then enter: "1 week" when prompted
```

### Multisig Timelock
```bash
btc-locker multisig --time 1765064511 --required 2 --pubkeys "key1,key2,key3"
```

### HODL Script
```bash
btc-locker hodl --time 1765064511 --owner 02eb121c... --emergency 03f9308a...
```

## Utilities
```bash
# Check if timelock expired
btc-locker check --time 1765064511

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

## Testing on Bitcoin Networks

- **Testnet** (default): Safe for testing, no real Bitcoin
- **Mainnet**: Real Bitcoin - use with extreme caution!

⚠️ **Always test on testnet first!**