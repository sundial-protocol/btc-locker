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

### Setting up a testnet wallet

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

### Connecting to a Custom API Server

Users can configure BTC_LOCKER_SERVER via:

1. Environment variable — set before running the CLI
2. --server-url flag — passed at runtime
3. .env in their cwd — optional convenience

The default "https://api.testnet.sundialprotocol.com" in the --server-url option also serves as a fallback if nothing is set.