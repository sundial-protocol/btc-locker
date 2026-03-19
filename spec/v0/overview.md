# btc-locker v0

The purpose of this library is to provide basic staking abilities, allowing us to connect users to custodial yield providers.

As such, the same level of trust is given to yield providers as any custodians - namely that the legal or social consequences of bad-faith activity is sufficient to keep them honest. We do not place restrictions on the yield provider's spending here, but instead seek to provide useful guidance and tooling to help them keep their word to their users.

## Flow & Components

Staking and yield distribution takes 4 transactions:

1. **Deposit** - user puts funds into the Escrow script
2. **Claim** - yield provider takes funds from the Escrow script
3. **Distribute** - yield provider returns funds to the user's Return script
4. **Withdraw** - user takes funds from Return script

Before this process can begin, the Return & Escrow scripts must be constructed:

1. **Return / Timelock** - simple timelock with the user's pubkey
2. **Escrow** - script with 2 valid keys for spending
   1. Before deadline (yield provider)
   2. After deadline (user)

These are intended to be constructed with the same deadline, such that the user can simply withdraw all funds at the same time, whether the yield provider has fully exhausted the escrow script or not.

More information on how these components work together can be found in [User Stories](./user-stories.md).
