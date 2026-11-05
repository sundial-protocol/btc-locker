---
"@sundial-protocol/btc-locker": patch
---

Claim and withdrawal transactions now count the metadata output when estimating the fee, as deposit and distribute already did. With metadata, they pay slightly more (34 bytes at the fee rate) and no longer risk falling under the target rate.
