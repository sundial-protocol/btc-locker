---
"@sundial-protocol/btc-provider": patch
"@sundial-protocol/btc-locker": patch
"@sundial-protocol/btc-locker-cli": patch
"@sundial-protocol/btc-regtest": patch
"@sundial-protocol/btc-runes": patch
"@sundial-protocol/solstice": patch
---

Each package now ships the MIT license text in a `LICENSE` file, and its `package.json` has a `license` field and a `repository.directory` pointing at its folder in this repo. Earlier releases said MIT in most `package.json` files, but the repository had no license file.
