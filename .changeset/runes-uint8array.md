---
"@sundial-protocol/solstice": minor
---

The Runes functions re-exported from `@sundial-protocol/btc-runes` (`encipherGuarded`, `nativeRunestoneCodec.encipher`, `runeCommitment`) now return a plain `Uint8Array`, not a Node `Buffer`, and accept any `Uint8Array`. Code that calls `Buffer` methods on a result has to wrap it first: `Buffer.from(script).toString("hex")`. Calling `.toString("hex")` on the bare result does not throw; it returns comma-separated numbers.
