# BTC Locker

Ready-to-use Bitcoin locking script (scriptPubKey) that locks funds until September 10, 2025 (UNIX timestamp 1757462400) and allows spending only by a specific public key.

Sample public key (compressed, for demonstration):
`0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798`

How it works:

Funds sent to this script cannot be spent until after September 10, 2025.
Only the holder of the corresponding private key can spend the funds after that date.

# Reusable Locker

When spending, the user provides:

- Their signature
- Their public key

So, the full unlocking script (scriptSig) is:
`<signature> <pubKey>`

This way, the same script can be used for any public key and signature, making it reusable for different UTXOs and users. The locktime can also be parameterized.
