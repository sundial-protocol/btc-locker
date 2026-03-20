# v0 Trust Model

This document defines exactly what the v0 protocol enforces on-chain versus what it relies on off-chain convention or legal agreement. It is intended as the authoritative reference for security auditors.

## Summary

v0 is a **custodial yield protocol**. Bitcoin script enforces the user's ability to reclaim their principal after a deadline and prevents the provider from spending the user's timelock. Everything else — key assignment, yield amount, and the provider's obligation to claim before the deadline — is governed by convention and a signed off-chain agreement.

---

## Script Structures

### Timelock (Return) Script

```
<locktime> OP_CHECKLOCKTIMEVERIFY OP_DROP <user_pubkey> OP_CHECKSIG
```

The user holds the only key. Funds are unspendable by anyone until `nLockTime >= locktime`.

### Escrow Script

```
OP_IF
  <deadline> OP_CHECKLOCKTIMEVERIFY OP_DROP <user_pubkey> OP_CHECKSIG
OP_ELSE
  <provider_pubkey> OP_CHECKSIG
OP_ENDIF
```

- **`OP_IF` branch** — user spends after the deadline passes.
- **`OP_ELSE` branch** — provider spends with no time constraint (see [known trust assumption](#known-trust-assumption-provider-race-after-deadline) below).

Both scripts are intended to be constructed with the same `deadline` / `locktime` value so the user can withdraw from both in a single operation once the period ends.

### Key Assignment Convention

The parameters are named by spending role, not by party. The mapping is:

| Script parameter       | Party    | Enforced by protocol?    |
| ---------------------- | -------- | ------------------------ |
| `beforePublicKey`      | Provider | **No — convention only** |
| `afterPublicKey`       | User     | **No — convention only** |
| `publicKey` (timelock) | User     | **No — convention only** |

Nothing in the script prevents either party from passing any key in any position. The correct assignment is the caller's responsibility.

---

## What Bitcoin Enforces

| Property                                                                                          | Mechanism                                      |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| User cannot withdraw principal before the deadline                                                | `OP_CHECKLOCKTIMEVERIFY` on both scripts       |
| Provider cannot spend from the timelock script                                                    | Provider holds no key for it                   |
| User's `OP_IF` escrow path requires `nLockTime >= deadline` to be set on the spending transaction | `OP_CHECKLOCKTIMEVERIFY` in the `OP_IF` branch |
| Only the holder of `afterPublicKey` can use the `OP_IF` path                                      | `OP_CHECKSIG` against `afterPublicKey`         |
| Only the holder of `beforePublicKey` can use the `OP_ELSE` path                                   | `OP_CHECKSIG` against `beforePublicKey`        |

---

## What Bitcoin Does Not Enforce

| Property                                                     | How it is governed                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `beforePublicKey` belongs to the provider                    | Convention — caller-supplied                                        |
| `afterPublicKey` and timelock `publicKey` belong to the user | Convention — caller-supplied                                        |
| Provider claims escrow only before the deadline              | Convention — see known trust assumption below                       |
| Provider distributes yield equal to the agreed amount        | Off-chain signed agreement between user and provider                |
| Provider distributes to the correct timelock address         | Off-chain signed agreement; `distribute.ts` accepts any destination |

---

## Transaction Trust Properties

### 1. Deposit (`createDepositTransaction`)

- **Signed by**: User
- **On-chain effect**: Creates UTXOs locked to the escrow address and the timelock address
- **Trust assumption**: User constructs scripts with the correct provider key in `beforePublicKey`. No on-chain enforcement of this.

### 2. Claim (`createClaimTransaction`)

- **Signed by**: Provider (spending `OP_ELSE` branch, `spendAfterDeadline: false`)
- **On-chain effect**: Sweeps the escrow UTXO to the provider's address
- **Trust assumption**: Provider claims before the deadline. Bitcoin does not enforce this upper bound — see known trust assumption below.
- **Note**: `spendAfterDeadline: true` activates the `OP_IF` branch and is the **user's reclaim path**, not a normal provider operation.

### 3. Distribute (`createDistributionTransaction`)

- **Signed by**: Provider
- **On-chain effect**: Sends funds from the provider's wallet to the user's timelock address
- **Trust assumption**: The amount distributed matches what was agreed. Bitcoin only verifies that the output reaches the specified address; the amount is not constrained on-chain.
- **Note**: There is no on-chain link between the Claim and Distribute transactions. The connection is enforced by the off-chain signed agreement only.

### 4. Withdraw (`createWithdrawalTransaction`)

- **Signed by**: User
- **On-chain effect**: Sweeps all UTXOs from both the escrow (via `OP_IF`) and the timelock, after the shared deadline
- **Trust assumption**: None beyond Bitcoin script. The user is the only party who can execute this path after the deadline.

---

## Known Trust Assumption: Provider Race After Deadline

After the deadline passes, both spending paths of the escrow become simultaneously valid:

- The user can spend via `OP_IF` (correctly gated by CLTV).
- The provider can **still** spend via `OP_ELSE` with no time constraint.

This creates a race condition in which a malicious or negligent provider could sweep the escrow after the deadline, before the user submits their withdrawal. If the provider wins the race, the user loses their principal from that UTXO. The timelock UTXO is unaffected.

**Why this is a trust assumption and not a bug**: Bitcoin's `OP_CHECKLOCKTIMEVERIFY` can enforce a lower bound ("not before time X") but has no opcode for an upper bound ("not after time X"). The `OP_ELSE` branch is intentionally unconstrained by time; provider honesty is a v0 protocol assumption, governed by the off-chain signed agreement.

**Mitigation**: The off-chain agreement requires the provider to claim before the deadline. Users are advised to submit their withdrawal promptly once the deadline passes.

---

## Threat Summary for Auditors

| Threat                                                 | Impact                       | Prevented by                                                        |
| ------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------- |
| Unauthorized third party steals escrow before deadline | Full loss of escrow UTXO     | Bitcoin (`OP_ELSE` requires valid signature from `beforePublicKey`) |
| Provider steals principal **after** deadline           | Full loss of escrow UTXO     | Off-chain agreement only                                            |
| Provider distributes less yield than agreed            | Shortfall in user's timelock | Off-chain agreement only                                            |
| Provider distributes yield to wrong address            | Loss of yield                | Off-chain agreement only; `distribute.ts` accepts any destination   |
| User withdraws before deadline                         | Impossible                   | Bitcoin CLTV                                                        |
| Third party spends either script                       | Impossible without a key     | Bitcoin CHECKSIG                                                    |
| Script created with wrong key assignments              | Keys control wrong parties   | Convention only — no on-chain enforcement                           |
