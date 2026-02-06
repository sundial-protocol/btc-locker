# User Stories of Staking Flow

The full v0 user stories for the staking flow. This is pre-server, so we assume discoverability and tracking via tx metadata (To be implemented)

## User Deposits Stake

Uses DawnStakingManager's createDawnStakingTransaction to create a new staking transaction, which sends outputs to the Escrow and Timelock addresses.

Parameters:

```ts
export interface DawnStakingParams {
  /** Array of unspent transaction outputs to stake (optional - will auto-select from address if not provided) */
  inputs?: UTXO[];
  /** Source address for automatic UTXO selection (required if inputs not provided) */
  sourceAddress: string;
  /** Escrow script address */
  escrowAddress: string;
  /** Amount to send to escrow in satoshis */
  escrowAmount: number;
  /** Timelock script address */
  timelockAddress: string;
  /** Amount to send to timelock in satoshis */
  timelockAmount: number;
  /** Optional change address for remaining funds */
  changeAddress?: string;
  /** Optional fee rate in satoshis per byte */
  feeRate?: number;
  /** Optional fee address for protocol fees */
  feeAddress?: string;
  /** Optional protocol fee amount in satoshis (required if feeAddress is provided) */
  protocolFeeAmount?: number;
}
```

```mermaid
flowchart LR
    Wallet(User Wallet) --> UserPkh[User Pubkey]
    Input(User Inputs) --> Duration[Staking Duration, Amounts]
    Input --> YieldPartner[Selected Yield Partner]

    UserPkh --> MkTimelock{Create Timelock Script}
    Duration --> MkTimelock
    Duration --> MkEscrow{Create Escrow Script}
    YieldPartner --> MkEscrow
    UserPkh --> MkEscrow

    MkTimelock --> TimelockScript[Timelock Redeem Script]
    MkTimelock --> TimelockP2SH[Timelock P2SH Address]
    MkEscrow --> EscrowP2SH[Escrow P2SH Address]
    MkEscrow --> EscrowScript[Escrow Redeem Script]

    TimelockP2SH --> Tx{Create Dawn Staking Transaction}
    EscrowP2SH --> Tx

    TimelockScript -.-> Backend(Backend Storage)
    EscrowScript -.-> Backend

    Tx --> Selection[Input Selection]
    Wallet --> Selection

    Selection --> Evaluate["Evaluate Inputs and Calculate Amounts"]

    Evaluate --> Creation[Create Outputs]
    Creation --> O1["Output 1: Escrow Address | Amount: escrowAmount sats"]
    Creation --> O2["Output 2: Timelock Address | Amount: timelockAmount sats"]
    Creation --> O3["Output 3: Gas | Amount: gas fee provided to block producer"]
    Creation --> O4["Output 4: Change Address | Amount: remaining sats minus fees"]

    O1 --> Result[Result: Unsigned PSBT]
    O2 --> Result
    O3 --> Result
    O4 --> Result

    classDef actor fill:#0c5f97
    classDef methodStep fill:#966D05
    classDef result fill:#118a12
    classDef input fill:#ac502a,color:#fff
    classDef method fill:#F6B020,color:#000

    class Wallet,Input,Backend actor
    class TimelockP2SH,EscrowP2SH,O1,O2,O3,O4,Selection,Evaluate,Creation methodStep
    class EscrowScript,TimelockScript,Result result
    class MkTimelock,MkEscrow,Tx method
    class UserPkh,Duration,YieldPartner input
```

## Yield Provider Withdraws Stake

Uses EscrowManager's createEscrowSpendingTransaction to create a transaction that spends from the escrow output

```ts
export interface EscrowSpendingParams {
  /** Script data returned from createEscrowScript */
  scriptData: ScriptInfo;
  /** Transaction ID of the UTXO to spend */
  utxoTxId: string;
  /** Output index of the UTXO to spend */
  utxoIndex: number;
  /** Amount in satoshis to spend */
  amount: number;
  /** Address to send funds to */
  outputAddress: string;
  /** Whether to spend after deadline (true) or before (false) */
  spendAfterDeadline: boolean;
  /** Current time for validation (defaults to Date.now()) */
  currentTime?: number;
  /** Previous transaction buffer (for testing/validation) */
  previousTransaction?: Buffer | null;
}
```

```mermaid
flowchart LR
    Wallet(Provider Wallet) --> PKH[Provider Pubkey]
    Input(Provider Input) --> User

    PKH --> Backend(Backend Storage)
    PKH --> MkTx{Create Escrow Spending Transaction}
    User --> Backend

    Backend --> RedeemScript[Escrow Redeem Script]
    RedeemScript --> MkTx

    MkTx --> Selection[Input Selection]
    Selection --> Creation[Create Outputs]

    Creation --> O1["Output 1: Withdrawal Output | Amount: Total amount from escrow minus fees"]
    Creation --> O2["Output 2: Gas | Amount: gas fee provided to block producer"]

    O1 --> Result[Result: Unsigned PSBT]
    O2 --> Result

    classDef actor fill:#0c5f97
    classDef methodStep fill:#966D05
    classDef result fill:#118a12
    classDef input fill:#ac502a,color:#fff
    classDef method fill:#F6B020,color:#000

    class Wallet,Input,Backend actor
    class Selection,Creation,O1,O2 methodStep
    class Result result
    class MkTx method
    class PKH,User,RedeemScript input
```

## Yield Provider Distributes Rewards

Uses the YieldDistributor's distributeYield to create a transaction that sends rewards from the yield provider to the user's timelock address.

```ts
export interface YieldDistributionParams {
  /** Array of unspent transaction outputs from timelock (optional - will fetch from address if not provided) */
  inputs?: YieldInput[];
  /** Source address for automatic UTXO selection (required if inputs not provided) */
  sourceAddress?: string;
  /** Bitcoin API instance for fetching UTXOs (required if inputs not provided) */
  api?: BitcoinAPI;
  /** Address of the timelock script */
  timelockAddress: string;
  /** Amount to distribute in satoshis */
  amount: number;
  /** Optional memo for the distribution */
  memo?: string;
  /** Optional change address for remaining funds */
  changeAddress?: string;
  /** Optional fee rate in satoshis per byte */
  feeRate?: number;
}
```

```mermaid

```

## User Withdraws Stake and Rewards

Uses the DawnStakingManager's createDawnWithdrawalTransaction to create a transaction that spends from the timelock output, which includes both the original stake and any accumulated rewards, as well as anything left over at the escrow address.

```ts
export interface DawnWithdrawalParams {
  /** Array of escrow inputs to withdraw from (optional - will fetch all UTXOs from escrow address if not provided) */
  escrowInputs?: UTXO[];
  /** Escrow script address (optional - will be calculated from escrowRedeemScript if not provided) */
  escrowAddress?: string;
  /** Escrow redeem script in hexadecimal format */
  escrowRedeemScript: string;
  /** Array of timelock inputs to withdraw from (optional - will fetch all UTXOs from timelock address if not provided) */
  timelockInputs?: UTXO[];
  /** Timelock script address (optional - will be calculated from timelockRedeemScript if not provided) */
  timelockAddress?: string;
  /** Timelock redeem script in hexadecimal format */
  timelockRedeemScript: string;
  /** Destination address for withdrawn funds */
  destination: string;
  /** Optional fixed fee amount in satoshis */
  feeAmount?: number;
  /** Optional fee address for protocol fees */
  feeAddress?: string;
  /** Optional protocol fee amount in satoshis (required if feeAddress is provided) */
  protocolFeeAmount?: number;
}
```

```mermaid

```
