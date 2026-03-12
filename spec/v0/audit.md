**A. Executive Summary**
Overall risk level: **Critical** for real-BTC use in current form.

Top 5 findings:
1. **Escrow script logic does not enforce “before deadline only” for the before-key path** (before-key can spend forever), enabling direct value capture contrary to docs.
2. **Dawn staking can burn large unintended fees** when `changeAddress` is omitted.
3. **Private key exposure risk is high in CLI/demo workflows** (argv/history/stdout/files/unauthenticated API usage patterns).
4. **Relative timelock (CSV) creation exists, but spending flow does not enforce CSV semantics**, so outputs are likely unspendable via provided API.
5. **Yield distribution has unsafe change default** (`changeAddress` fallback to recipient timelock address), causing accidental overpayment.

Core design verdict: **Fragile**. Script-building intent is clear, but state transitions/signing/documentation are inconsistent enough to create realistic fund-loss and fund-lock scenarios.

**B. Threat Model**
Assets:
1. Private keys and derived spend authority.
2. UTXOs and signed transactions.
3. Redeem scripts, locktimes, sequence settings.
4. Yield accounting outputs and distribution amounts.
5. CLI/demo host environment secrets and logs.

Actors:
1. Legitimate user/yield provider/operator.
2. Counterparty with one escrow key.
3. Malicious or faulty external API provider (UTXO/tx feed).
4. Local attacker with process/history/file access.
5. Remote attacker if demo API is exposed.

Trust boundaries:
1. Library caller input -> script/tx constructors.
2. CLI terminal/filesystem/process table.
3. Public blockchain API responses -> transaction construction.
4. Browser runtime/demo server -> key handling.
5. Docs/tests vs real implementation behavior.

Assumptions currently required (unsafe):
1. Callers always provide safe locktime/sequence/key data.
2. Callers always provide a safe change destination.
3. Local wall-clock approximates consensus finality timing.
4. Users never leak keys through CLI argument patterns.
5. External API data is timely and correct.

High-value attack surfaces:
1. Escrow script branch semantics.
2. Change handling in staking/yield flows.
3. Generic `signTransaction` behavior and PSBT assumptions.
4. CLI private key surfaces.
5. Demo API endpoints and CORS/auth posture.

**C. Step-by-Step Reasoning**
1. Key generation/input:
`generateKeyPair`/`generateKeyPairFromPrivateKey` works, but operational handling is weak: CLI accepts and prints secrets openly ([base.js:61](bin/commands/base.js:61), [transactions.js:25](bin/commands/transactions.js:25), [base.js:121](bin/commands/base.js:121)).

2. Script creation:
Absolute and relative timelock scripts compile as expected ([timelock.ts:35](src/locker/timelock.ts:35), [timelock.ts:77](src/locker/timelock.ts:77)).
Escrow script branch semantics are unsafe for intended policy: before-key branch has no deadline check ([escrow.ts:107](src/locker/escrow.ts:107)).

3. Address derivation:
P2SH addresses are derived from redeem scripts ([scripts.ts:95](src/utils/scripts.ts:95)). That is internally consistent, but demo/API/docs imply broader script types not implemented.

4. Funding:
Funding/staking/yield PSBT inputs are built with placeholder or assumed scripts ([transactions.ts:226](src/locker/transactions.ts:226), [dawn-stake.ts:490](src/locker/dawn-stake.ts:490), [yield.ts:144](src/locker/yield.ts:144)). This is brittle for non-P2WPKH and can silently create invalid sign contexts.

5. Lock enforcement:
Local enforcement relies on `Date.now()` and simplistic parsing of scripts in some paths ([transactions.ts:150](src/locker/transactions.ts:150), [dawn-stake.ts:905](src/locker/dawn-stake.ts:905)). This is not consensus-equivalent and can produce false “ready to spend” states.

6. Unlocking/spending:
`createSpendingTransaction` returns raw tx hex ([transactions.ts:197](src/locker/transactions.ts:197)) but primary signing path expects PSBT base64 ([core.ts:163](src/locker/core.ts:163)); CLI uses them together ([transactions.js:768](bin/commands/transactions.js:768)). This mismatch makes intended lifecycle unreliable.

7. Yield/distribution:
Change behavior is unsafe by default: falls back to recipient timelock address ([yield.ts:164](src/locker/yield.ts:164)). A missing `changeAddress` can unintentionally transfer surplus.

8. CLI interaction:
Many commands fetch and consume all confirmed UTXOs, increasing DoS sensitivity and fee unpredictability ([transactions.js:235](bin/commands/transactions.js:235), [transactions.js:487](bin/commands/transactions.js:487), [transactions.js:1299](bin/commands/transactions.js:1299)).

**D. Findings**

1. Escrow “before” key can spend forever (policy bypass)
Severity: **Critical**  
Affected: [escrow.ts:107](src/locker/escrow.ts:107), [escrow.ts:199](src/locker/escrow.ts:199), [scripts.js:158](bin/commands/scripts.js:158)  
Why it matters: Design intent claims “before deadline A, after deadline B”, but script enforces deadline only on one branch.  
Exploit scenario: Holder of before-key waits past deadline and sweeps funds before after-key holder can spend.  
Evidence: `OP_ELSE <beforePubKey> CHECKSIG` has no CLTV gate; time check in tx builder only blocks `spendAfterDeadline=true`.  
Minimal-scope improvement: Make both branches time-constrained to enforce exclusivity; add invariant tests for “before key invalid after T”.  
Type: **Design-level + implementation-level**.

2. Dawn staking can unintentionally burn large fees when `changeAddress` is omitted
Severity: **Critical**  
Affected: [dawn-stake.ts:445](src/locker/dawn-stake.ts:445), [dawn-stake.ts:525](src/locker/dawn-stake.ts:525), [transactions.js:97](bin/commands/transactions.js:97)  
Why it matters: Positive change is silently not returned unless change address is provided.  
Exploit scenario: User stakes small amount from a large UTXO set with no change address; remainder becomes miner fee.  
Evidence: Change output added only if `changeAddress` exists; no fail-fast when significant change exists.  
Minimal-scope improvement: Require explicit `changeAddress` (or default to source address) whenever change > dust.  
Type: **Implementation-level + API design**.

3. Private key leakage via CLI and demo usage patterns
Severity: **High**  
Affected: [transactions.js:25](bin/commands/transactions.js:25), [base.js:61](bin/commands/base.js:61), [base.js:121](bin/commands/base.js:121), [demo/demo.html:136](demo/demo.html:136)  
Why it matters: Keys in argv/history/stdout/files are straightforward theft targets.  
Exploit scenario: Local attacker reads shell history, process list, CI logs, or world-readable key export file.  
Evidence: Private keys are CLI flags, interactive plain-text fields, and rendered in demo output.  
Minimal-scope improvement: Use stdin/password prompts, warn/disable argv key flags by default, write key files with restrictive perms, reduce secret echoing.  
Type: **Operational + implementation-level**.

4. Relative timelock outputs are not safely spendable through provided flow
Severity: **High**  
Affected: [timelock.ts:77](src/locker/timelock.ts:77), [transactions.ts:131](src/locker/transactions.ts:131), [transactions.ts:185](src/locker/transactions.ts:185)  
Why it matters: Users can create CSV scripts but spend path does not set/validate CSV sequence semantics.  
Exploit scenario: Funds are sent to relative timelock address and later cannot be spent by library workflow.  
Evidence: Spend path only detects CLTV and defaults sequence to final when no locktime found.  
Minimal-scope improvement: Add explicit CSV spend builder with required `nSequence`/version checks and vector tests.  
Type: **Design-level + implementation-level**.

5. Yield distribution unsafe default can overpay recipient with unintended change
Severity: **High**  
Affected: [yield.ts:159](src/locker/yield.ts:159), [yield.ts:164](src/locker/yield.ts:164)  
Why it matters: Missing `changeAddress` routes change to `timelockAddress`, potentially transferring far more than intended.  
Exploit scenario: Provider intends 50k sats yield, signs tx from 1M sats, and accidentally sends ~949k extra to recipient side.  
Evidence: `address: params.changeAddress || timelockAddress`.  
Minimal-scope improvement: Require explicit change address or default to source; block signing when implicit change destination differs from source.  
Type: **Implementation-level**.

6. Transaction creation/signing interfaces are internally inconsistent
Severity: **High**  
Affected: [transactions.ts:122](src/locker/transactions.ts:122), [transactions.ts:197](src/locker/transactions.ts:197), [core.ts:163](src/locker/core.ts:163), [transactions.js:768](bin/commands/transactions.js:768)  
Why it matters: Raw-hex outputs and PSBT signing paths are mixed, producing invalid lifecycle assumptions.  
Exploit scenario: Operator believes spend tx is signed and ready, misses unlock window while repeatedly failing broadcast.  
Evidence: Spend builder returns raw tx, signer expects PSBT base64; CLI wires them together.  
Minimal-scope improvement: Enforce one canonical format per flow; add runtime type guards and fail-fast messages.  
Type: **Implementation-level**.

7. Missing cryptographic and timelock boundary validation can create unspendable/bypassable outputs
Severity: **Medium**  
Affected: [keys.ts:42](src/utils/keys.ts:42), [validation.ts:18](src/utils/validation.ts:18), [timelock.ts:71](src/locker/timelock.ts:71)  
Why it matters: Length-only key validation and unbounded locktime/sequence allow invalid or dangerous scripts.  
Exploit scenario: Caller passes non-curve pubkey or CSV disable-flag sequence; funds become unspendable or lock bypassed.  
Evidence: No secp256k1 point validity check; locktime only non-negative integer; sequence not validated in relative scripts.  
Minimal-scope improvement: Validate curve points, `0 <= locktime <= 0xffffffff`, and strict CSV mask/disable/type semantics.  
Type: **Implementation-level**.

8. UTXO and API processing are vulnerable to practical resource-abuse
Severity: **Medium**  
Affected: [transactions.js:235](bin/commands/transactions.js:235), [transactions.js:487](bin/commands/transactions.js:487), [dawn-stake.ts:991](src/locker/dawn-stake.ts:991), [bitcoin-api.ts:153](src/bitcoin-api.ts:153)  
Why it matters: Dust flooding or large API payloads can degrade or block spending workflows.  
Exploit scenario: Attacker sends many dust UTXOs to source/script addresses; CLI builds enormous txs and repeatedly fetches full prev tx hex for each input.  
Evidence: “Use all confirmed UTXOs” patterns; no explicit caps; response body accumulated unbounded.  
Minimal-scope improvement: Input caps, coin-selection limits, request size/timeouts, and retry/backoff controls.  
Type: **Implementation-level + operational**.

9. Demo API is unsafe if exposed and contains stale/nonexistent method contracts
Severity: **Medium**  
Affected: [demo/demo-server.js:87](demo/demo-server.js:87), [demo/api-routes.js:149](demo/api-routes.js:149), [demo/api-routes.js:375](demo/api-routes.js:375), [demo/api-routes.js:451](demo/api-routes.js:451)  
Why it matters: Exposed demo can be abused; docs claim security controls not actually present.  
Exploit scenario: Internet user scripts key-derivation endpoints, triggers errors, and abuses unrestricted CORS/open API surface.  
Evidence: Open CORS, no auth/rate-limit, and routes calling methods not present in current library.  
Minimal-scope improvement: Keep demo local-only by default, add explicit auth/rate-limit guard, remove stale endpoints.  
Type: **Operational + implementation-level**.

10. Dependency and supply-chain posture has known vulnerabilities
Severity: **Medium**  
Affected: `package-lock.json` (via `npm audit --package-lock-only`)  
Why it matters: Multiple high/moderate advisories increase build/runtime attack surface.  
Exploit scenario: Known vulnerable transitive dep reached via exposed tooling path (especially demo/docs stack).  
Evidence: Audit reported 16 vulnerabilities (6 high, 4 moderate, 6 low), including `bip32`, `minimatch`, `serialize-javascript`, `valibot`.  
Minimal-scope improvement: Triage and patch direct/transitive vulnerabilities; gate releases on audited baseline.  
Type: **Operational**.

**E. State Transition Review**
Does lifecycle logic make sense: **Partially, but unsafe/under-specified in critical points**.

Lifecycle reconstruction:
1. Key generation/input: library can generate/import keys, but secret-handling defaults are unsafe in CLI/demo.
2. Script creation: timelock/escrow scripts are generated, but escrow policy semantics conflict with stated intent.
3. Address derivation: deterministic P2SH derivation is present.
4. Funding: transaction constructors exist but often rely on placeholders/assumptions about script type.
5. Lock enforcement: consensus lock conditions are partially modeled; local time checks are non-authoritative and script parsing is brittle.
6. Unlock/spend: raw-tx and PSBT pathways are mixed; CSV spend state is missing.
7. Yield distribution: accounting path exists but change safety is weak.
8. CLI interaction: UX suggests safe workflows but defaults can leak keys or move unintended value.

Invalid/dangerous states identified:
1. “Before-deadline” escrow key remains valid after deadline.
2. Positive change with no explicit change address causes fee burn or unintended transfer.
3. Relative timelock output created without a corresponding valid spend transition.
4. API consumers may think a transaction is signed-valid while format mismatch exists.

Missing preconditions/postconditions/invariants:
1. Precondition: “before key only before T” not encoded as invariant.
2. Precondition: explicit change destination for all value-preserving flows.
3. Postcondition: sum(inputs) = sum(outputs) + expected_fee, with bounded fee sanity.
4. Invariant: script type must match signing metadata (`nonWitnessUtxo`/`witnessUtxo` correctness).
5. Invariant: generated script must be spendable by at least one provided path (tested).

API permits creating outputs unsafe to spend later:
1. Relative timelock outputs.
2. Scripts with invalid pubkeys/unsafe locktime/sequence values.
3. Potentially escrow/timelock paths with mismatched signing assumptions.

**F. DDoS / Abuse Review**
Abuse paths:
1. UTXO dust pollution against source/script addresses inflates inputs and tx-building costs.
2. Dawn withdrawal fetching full previous tx per input amplifies API and memory load.
3. Unbounded HTTP response accumulation in BitcoinAPI can be memory-abused.
4. Open demo API/CORS can be request-flooded if exposed.

Practical impact:
1. Spending transactions become huge, expensive, or unbroadcastable.
2. Withdrawal latency spikes and may miss timing windows.
3. Process memory pressure/crash risk in extreme responses.
4. Demo server resource exhaustion and noisy logs.

Minimal mitigations:
1. Cap max inputs per transaction and per API call.
2. Add coin selection policies and dust filters.
3. Add request timeouts/size limits and retry budgets.
4. Add demo auth/rate-limits and bind-local-only defaults.

**G. Verification Plan**
1. Threat modeling:
Verify key abuse paths: counterparty key misuse, API spoofing impact, local secret leakage.
2. Invariant checks:
Automate checks for value conservation, fee bounds, change handling, locktime/sequence correctness, and script/address/network consistency.
3. Property-based testing:
Generate random locktime/sequence/key inputs to prove no unspendable or bypass scripts are emitted.
4. Fuzzing:
Fuzz script parsers and CLI input parsing (`locktime`, redeem script, UTXO payloads) for crash/DoS and unsafe acceptance.
5. Differential testing:
Compare constructed tx/script behavior against trusted `bitcoinjs-lib` reference validation and regtest mempool acceptance.
6. Script/tx test vectors:
Add fixed vectors for CLTV/CSV boundary cases, branch selection, and sighash determinism.
7. Boundary tests:
Explicit cases at `499999999/500000000`, `0xffffffff`, CSV disable/type flags, dust thresholds, and large UTXO sets.
8. Reproducibility checks:
Ensure PSBT serialization/signing is deterministic across Node/browser builds.
9. Dependency checks:
Automated `npm audit` gate with allowed-exception policy and periodic lockfile refresh.
10. CLI abuse-case tests:
Ensure secrets are not echoed/stored unsafely and command defaults cannot move unintended funds.

**H. Minimal-Scope Improvement Plan**
Must fix before production:
1. Fix escrow branch semantics to enforce intended before/after exclusivity.
2. Make explicit safe change handling mandatory in staking/yield paths.
3. Harden secret handling in CLI/demo (no plaintext argv defaults, safer file permissions).
4. Add valid CSV spend path and block relative script creation without spend support.
5. Unify spend/sign transaction formats and enforce strict runtime validation.

Should improve soon:
1. Validate secp256k1 public keys and locktime/sequence bounds.
2. Add robust script-type-aware signing metadata checks.
3. Add UTXO/input caps and API timeout/backoff limits.
4. Align docs/tests/CLI with current APIs; remove stale endpoints and methods.

Nice to have:
1. Better coin selection and fee estimation model.
2. Stronger release hardening (SBOM/signing/audit baseline docs).
3. Consensus-time awareness docs (MTP vs local clock).

1. Prioritized concrete issues:
1. Escrow branch policy bypass (Critical).
2. Dawn staking change fee-burn risk (Critical).
3. CLI/demo key leakage risk (High).
4. Relative timelock spend-path gap (High).
5. Yield change misrouting (High).
6. Spend/sign API inconsistency (High).
7. Validation and boundary gaps (Medium).
8. DoS/resource amplification paths (Medium).
9. Demo API exposure/stale routes (Medium).
10. Dependency vulnerabilities (Medium).

2. Minimal-scope hardening roadmap:
1. Week 1: escrow semantics + change-safety + transaction-format guards.
2. Week 2: CSV spend support + validation hardening + secret-handling fixes.
3. Week 3: abuse controls + regression/invariant test suite + dependency patch pass.

3. MVP verdict for real Bitcoin value:
**Not safe enough yet for MVP with real BTC.**  
It is close to a usable prototype for testnet/controlled environments, but current critical/high issues create realistic fund-loss/fund-lock/key-leak scenarios.