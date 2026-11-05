---
"@sundial-protocol/btc-provider": minor
---

Add a `baseUrl` option for a self-hosted mempool or Esplora server. Every request goes there, with no fallback to the public providers, and it works on any network, regtest included. Without a `baseUrl`, regtest still throws, now with a message that names the option.

`BitcoinAPIError.provider`, `onFallback`'s first argument and the `provider`/`providers` getters are now typed `ProviderName` (`ApiProvider | "custom"`), since a `baseUrl` server is reported as `"custom"`. Code that stores them in an `ApiProvider` variable needs the wider type. Adds a README for the package.
