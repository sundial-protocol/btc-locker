---
"@sundial-protocol/solstice": patch
---

The Runes primitives (runestone codec, cenotaph guard, rune names, rune ids, varints) moved to the new `@sundial-protocol/btc-runes` package. Solstice depends on it and still re-exports the same names, so existing imports keep working.
