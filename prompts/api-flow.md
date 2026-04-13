# Sundial v1 API Flow

This document describes the current end-to-end actor flow exposed by the API in this repository, from deposit intent creation through withdrawal confirmation.

It is based on the active routes and service logic in `apps/api/src/**`.

## Scope

- `api` creates and reads intents plus claimable/due views.
- `indexer` moves deposits and distributions through `*_SEEN` and `*_CONFIRMED` statuses after on-chain transactions are broadcast and observed on Bitcoin.
- There is no API endpoint today for:
  - registering a provider-claim intent,
  - broadcasting Bitcoin transactions,
  - registering a user-withdrawal intent,
  - fetching a provider distribution by `distribution_id`.

That means several steps in the lifecycle are:

1. call an API endpoint,
2. build/sign/broadcast a Bitcoin transaction off-chain,
3. poll a read endpoint until the indexer advances the status.

## Lifecycle Overview

Deposit lifecycle:

`INTENT_CREATED` -> `DEPOSIT_SEEN` -> `DEPOSIT_CONFIRMED` -> `PROVIDER_CLAIM_SEEN` -> `PROVIDER_CLAIM_CONFIRMED` -> `DISTRIBUTION_SEEN` -> `DISTRIBUTION_CONFIRMED` -> `WITHDRAWAL_SEEN` -> `WITHDRAWAL_CONFIRMED`

Distribution/allocation lifecycle:

`INTENT_CREATED` -> `DISTRIBUTION_SEEN` -> `DISTRIBUTION_CONFIRMED` -> `WITHDRAWAL_SEEN` -> `WITHDRAWAL_CONFIRMED`

## Endpoints By Actor

### User endpoints

| Endpoint                                                   | When to call                                                              | Purpose                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /v1/providers`                                        | Before creating a deposit                                                 | Discover active providers and active programs.                                     |
| `POST /v1/users/deposits/intent`                           | To create a deposit intent and have the API build a deposit PSBT template | Returns `deposit_id`, `psbt_base64`, and the initial `INTENT_CREATED` status.      |
| `POST /v1/users/deposits/intent-psbt`                      | To create a deposit intent with an externally built PSBT template         | Same lifecycle as above, but caller supplies `psbt_base64`.                        |
| `GET /v1/users/deposits/intent/:deposit_id`                | After broadcasting deposit, distribution, or withdrawal transactions      | Poll the latest deposit lifecycle status for one deposit.                          |
| `GET /v1/users/deposits/intents/:user_beneficiary_address` | To view all deposits for one user address                                 | Read the same deposit lifecycle statuses across all deposits for that beneficiary. |
| `GET /v1/users/:beneficiary_address/claimable`             | After a final distribution is confirmed                                   | List claimable user returns that can be withdrawn.                                 |

### Provider endpoints

| Endpoint                                                        | When to call                                                                   | Purpose                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `GET /v1/providers`                                             | Before interacting with deposits or distributions                              | Discover active providers and programs.                                                   |
| `GET /v1/providers/:providerId/claimable`                       | After a deposit reaches `DEPOSIT_CONFIRMED`                                    | List deposits whose escrow portion can be claimed by the provider.                        |
| `GET /v1/providers/:providerId/distributions/due?within_days=N` | After a provider claim is confirmed and maturity is near or reached            | List deposits that are due for FINAL distribution registration and not already allocated. |
| `POST /v1/providers/distributions/intent`                       | To register a FINAL distribution intent                                        | Creates a distribution plus derived allocations with `INTENT_CREATED` status.             |
| `POST /v1/providers/distributions/intent-psbt`                  | To register a FINAL distribution intent with an externally built PSBT template | Same as above, but caller supplies `psbt_base64`.                                         |

## End-To-End Sequence

### 1. User discovers a provider and program

The user calls:

`GET /v1/providers`

This returns active providers and each provider's active programs, including:

- `provider_id`
- `program_id`
- `expected_yield_bps`
- `min_lock_ms`
- `program_vault_address`

The user uses this response to pick the `provider_id` and `program_id` for the deposit intent.

### 2. User creates a deposit intent

The user calls one of:

- `POST /v1/users/deposits/intent`
- `POST /v1/users/deposits/intent-psbt`

Use `POST /v1/users/deposits/intent` when the API should build the deposit PSBT template.

Example request:

```json
{
  "user_beneficiary_address": "tb1qar0srrr7xfkvy5l643lydnw9re59gtzzwf7j2a",
  "provider_id": "550e8400-e29b-41d4-a716-446655440001",
  "program_id": "660e8400-e29b-41d4-a716-446655440001",
  "amount_sats": 100000,
  "alpha_bps": 2000,
  "lock_ms": 10000,
  "user_pubkey_hex": "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
}
```

Use `POST /v1/users/deposits/intent-psbt` when the caller already has a PSBT template and wants the API to persist the intent only.

Example request:

```json
{
  "user_beneficiary_address": "tb1qar0srrr7xfkvy5l643lydnw9re59gtzzwf7j2a",
  "provider_id": "550e8400-e29b-41d4-a716-446655440001",
  "program_id": "660e8400-e29b-41d4-a716-446655440001",
  "amount_sats": 100000,
  "alpha_bps": 2000,
  "lock_ms": 10000,
  "psbt_base64": "cHNidP8BAHECAAAAAQ=="
}
```

The API returns:

- `deposit_id`
- `status=INTENT_CREATED`
- `psbt_base64`
- `network`

### 3. User signs and broadcasts the deposit transaction

There is no API route for broadcasting the deposit transaction.

After broadcast:

- the indexer moves the deposit to `DEPOSIT_SEEN` when it sees the on-chain deposit transaction,
- the indexer later moves it to `DEPOSIT_CONFIRMED`.

To follow progress, the user can poll either:

- `GET /v1/users/deposits/intent/:deposit_id`
- `GET /v1/users/deposits/intents/:user_beneficiary_address`

### 4. Provider finds deposits that are ready to claim

Once the deposit is `DEPOSIT_CONFIRMED`, the provider calls:

`GET /v1/providers/:providerId/claimable`

This returns the provider-side claimable deposits for that provider. Each row includes:

- `deposit_id`
- `program_id`
- `program_vault_address`
- `amount_sats`
- `alpha_bps`
- `lock_ms`
- `escrow_amount_sats`
- `reserve_amount_sats`

`escrow_amount_sats` is the gross escrow principal claimable on-chain before the provider-paid claim transaction fee is deducted from the payout output.

### 5. Provider broadcasts the provider-claim transaction

There is no provider-claim write endpoint in the current API.

The provider builds, signs, and broadcasts the provider-claim transaction off-chain.

After broadcast:

- the indexer moves the deposit to `PROVIDER_CLAIM_SEEN`,
- the indexer later moves it to `PROVIDER_CLAIM_CONFIRMED`.

The deposit must reach `PROVIDER_CLAIM_CONFIRMED` before it is eligible for FINAL distribution registration.

### 6. Provider finds deposits that are due for distribution

The provider calls:

`GET /v1/providers/:providerId/distributions/due?within_days=N`

This endpoint returns deposits that:

- belong to the provider,
- are already `PROVIDER_CLAIM_CONFIRMED`,
- have `maturity_at <= now + within_days`,
- are not already allocated to another distribution.

Each row includes:

- `deposit_id`
- `program_id`
- `user_beneficiary_address`
- `principal_sats`
- `due_at`

`principal_sats` is derived from the deposit escrow amount.

### 7. Provider registers a FINAL distribution intent

The provider calls one of:

- `POST /v1/providers/distributions/intent`
- `POST /v1/providers/distributions/intent-psbt`

Use `POST /v1/providers/distributions/intent` when the API should create the distribution intent without an externally supplied PSBT template.

Example request:

```json
{
  "provider_id": "550e8400-e29b-41d4-a716-446655440001",
  "program_id": "660e8400-e29b-41d4-a716-446655440001",
  "payable_at": "2026-01-31T00:00:00.000Z",
  "allocations": [
    {
      "deposit_id": "770e8400-e29b-41d4-a716-446655440001",
      "yield_sats": 1500,
      "destination_address": "tb1qar0srrr7xfkvy5l643lydnw9re59gtzzwf7j2a"
    }
  ]
}
```

Use `POST /v1/providers/distributions/intent-psbt` when the provider already has the PSBT template and wants to persist it with the intent.

Important rules enforced by the API:

- the program must belong to the provider,
- only `FINAL` distributions are supported,
- every referenced deposit must exist,
- every deposit must already be `PROVIDER_CLAIM_CONFIRMED`,
- every deposit must belong to the same provider and program,
- `deposit.maturity_at` must be on or before `payable_at`,
- `allocations[].destination_address` must exactly match the deposit's `user_beneficiary_address`,
- a deposit cannot be allocated to more than one distribution.

The response includes:

- `distribution_id`
- `status=INTENT_CREATED`
- `distribution_type=FINAL`
- `allocations[]`

For each allocation, the API derives:

- `distribution_allocation_id`
- `principal_return_sats`
- `yield_sats`

### 8. Provider signs and broadcasts the distribution transaction

There is no API route for broadcasting the distribution transaction.

After broadcast:

- the indexer marks allocations and the parent distribution as `DISTRIBUTION_SEEN`,
- after confirmation, the indexer marks them `DISTRIBUTION_CONFIRMED`,
- for FINAL programs, the related deposits also advance from `PROVIDER_CLAIM_CONFIRMED` to `DISTRIBUTION_SEEN` and then `DISTRIBUTION_CONFIRMED`.

At this point, the user's return becomes claimable.

### 9. User checks claimable returns

Once the distribution is confirmed, the user calls:

`GET /v1/users/:beneficiary_address/claimable`

This returns one row per confirmed allocation, including:

- `distribution_allocation_id`
- `distribution_id`
- `deposit_id`
- `provider_id`
- `program_id`
- `status`
- `principal_return_sats`
- `yield_sats`
- `total_return_sats`

This is the main API signal that the user can now withdraw.

### 10. User signs and broadcasts the withdrawal transaction

There is no withdrawal-intent write endpoint in the current API.

The user builds, signs, and broadcasts the withdrawal transaction off-chain.

After broadcast:

- the indexer marks the allocation as `WITHDRAWAL_SEEN`,
- the related deposit also advances to `WITHDRAWAL_SEEN`,
- after confirmation, the allocation and deposit move to `WITHDRAWAL_CONFIRMED`.

### 11. User or provider verifies withdrawal completion

To confirm the lifecycle is complete, poll:

- `GET /v1/users/deposits/intent/:deposit_id`, or
- `GET /v1/users/deposits/intents/:user_beneficiary_address`

The flow is complete when the deposit reaches:

`WITHDRAWAL_CONFIRMED`

## Practical Call Order

### User happy path

1. `GET /v1/providers`
2. `POST /v1/users/deposits/intent` or `POST /v1/users/deposits/intent-psbt`
3. Broadcast deposit transaction off-chain
4. Poll `GET /v1/users/deposits/intent/:deposit_id` until `DEPOSIT_CONFIRMED`
5. Wait for provider claim and provider distribution
6. Poll `GET /v1/users/:beneficiary_address/claimable` until the allocation appears
7. Broadcast withdrawal transaction off-chain
8. Poll `GET /v1/users/deposits/intent/:deposit_id` until `WITHDRAWAL_CONFIRMED`

### Provider happy path

1. `GET /v1/providers`
2. Poll `GET /v1/providers/:providerId/claimable` for deposits at `DEPOSIT_CONFIRMED`
3. Broadcast provider-claim transaction off-chain
4. Poll `GET /v1/providers/:providerId/distributions/due?within_days=N`
5. `POST /v1/providers/distributions/intent` or `POST /v1/providers/distributions/intent-psbt`
6. Broadcast distribution transaction off-chain
7. Wait for user withdrawal and deposit status to reach `WITHDRAWAL_CONFIRMED`

## Current API Gaps To Be Aware Of

- Provider claim is an on-chain step with no dedicated API write endpoint.
- User withdrawal is an on-chain step with no dedicated API write endpoint.
- There is no provider-side `GET /distributions/:distribution_id` route today.
- The most complete lifecycle status read currently exposed by the API is the deposit read surface under `/v1/users/deposits/**`.