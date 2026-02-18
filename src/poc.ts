import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import { BTCLocker } from "./locker";
bitcoin.initEccLib(ecc);

const network = bitcoin.networks.testnet;

// Published once by Sundial (protocol namespace). x-only pubkey (32 bytes).
const K_SUNDIAL_XONLY = Buffer.from(
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "hex"
);

function leaf(script: Buffer) {
  return { output: script };
}

function p2trFromSundialLeaf(tapscriptLeaf: { output: Buffer }) {
  const p2tr = bitcoin.payments.p2tr({
    internalPubkey: K_SUNDIAL_XONLY,
    scriptTree: tapscriptLeaf,
    network,
  });
  if (!p2tr.output || !p2tr.address) throw new Error("Failed to build P2TR payment");
  return p2tr;
}

// Provider spend helper: derive revealed script + controlBlock for a given leaf
function deriveRevealAndControlBlock(tapscriptLeaf: { output: Buffer }) {
  const spend = bitcoin.payments.p2tr({
    internalPubkey: K_SUNDIAL_XONLY,
    scriptTree: tapscriptLeaf,
    redeem: tapscriptLeaf, // choose this leaf for script-path spend
    network,
  });
  if (!spend.witness || spend.witness.length < 3) {
    throw new Error("Failed to derive script-path witness/controlBlock");
  }
  const revealedScript = spend.witness[spend.witness.length - 2];
  const controlBlock = spend.witness[spend.witness.length - 1];
  return { revealedScript, controlBlock };
}

// ----------------- DEMO KEYS -----------------

const userKey = bitcoin.ECPair.makeRandom({ network });
const providerKey = bitcoin.ECPair.makeRandom({ network });

const userPubkey = userKey.publicKey;
const providerPubkey = providerKey.publicKey;

// ----------------- PARAMETERS -----------------

const depositId = "D12345";
const N_sats = 100_000_000;         // 1 BTC
const alpha = 0.8;
const escrowAmount = Math.floor(N_sats * alpha);     // 0.8 BTC
const reserveAmount = N_sats - escrowAmount;         // 0.2 BTC

// CLTV locktime: use block height here (must be <= 500,000,000)
const T = 2_500_000;

// ----------------- 1) USER DEPOSIT TX -----------------
/**
 * 1) User builds + "broadcasts" a DEPOSIT tx with two outputs:
 *    - ESCROW P2TR (alpha*N) using K_SUNDIAL namespace + escrow tapscript
 *    - RESERVE P2TR ((1-alpha)*N) using K_SUNDIAL namespace + reserve tapscript
 *    - OP_RETURN deposit_id
 **/

// Build scripts + P2TR outputs
const locker = new BTCLocker();
const escrowScript = await locker.createEscrowScript(T, userPubkey, providerPubkey);
const reserveScript = await locker.createTimelockScript(T, userPubkey);

const escrowLeaf = leaf(escrowScript);
const reserveLeaf = leaf(reserveScript);

const escrowP2TR = p2trFromSundialLeaf(escrowLeaf);
const reserveP2TR = p2trFromSundialLeaf(reserveLeaf);

const opReturnScript = bitcoin.script.compile([
  bitcoin.opcodes.OP_RETURN,
  Buffer.from(depositId, "utf8"),
]);

// User funding UTXO - comes from user's wallet/UTXO set.
const userFundingUtxo = {
  txid: "11".repeat(32),
  vout: 0,
  valueSats: N_sats + 2_000, // enough to fund N plus fee
  // P2WPKH scriptPubKey for user's funding UTXO
  scriptPubKey: bitcoin.payments.p2wpkh({ pubkey: userPubkey, network }).output!,
};

// Build deposit PSBT
const depositPsbt = new bitcoin.Psbt({ network });
depositPsbt.addInput({
  hash: userFundingUtxo.txid,
  index: userFundingUtxo.vout,
  witnessUtxo: {
    script: userFundingUtxo.scriptPubKey,
    value: BigInt(userFundingUtxo.valueSats),
  },
});

const userChangeAddr = bitcoin.payments.p2wpkh({ pubkey: userPubkey, network }).address!;
depositPsbt.addOutput({ script: escrowP2TR.output!, value: BigInt(escrowAmount) });
depositPsbt.addOutput({ script: reserveP2TR.output!, value: BigInt(reserveAmount) });
depositPsbt.addOutput({ script: opReturnScript, value: BigInt(0) });

const depositFee = 2_000;
const change = userFundingUtxo.valueSats - (escrowAmount + reserveAmount + depositFee);
if (change < 0) {
    throw new Error("Insufficient funding UTXO");
}
if (change > 546) {
    depositPsbt.addOutput({ address: userChangeAddr, value: BigInt(change) });
}

// Sign and finalize deposit
depositPsbt.signInput(0, userKey);
depositPsbt.finalizeAllInputs();

// "Broadcast" deposit tx (here we just extract it)
const depositTx = depositPsbt.extractTransaction();
const depositTxId = depositTx.getId();
const depositTxHex = depositTx.toHex();

console.log("DEPOSIT txid:", depositTxId);
console.log("DEPOSIT tx hex:", depositTxHex);
console.log("ESCROW address:", escrowP2TR.address);
console.log("RESERVE address:", reserveP2TR.address);

// Identify the outpoint that the provider will later spend.
const escrowOutpoint = {
  txid: depositTxId,
  vout: 0,
  valueSats: escrowAmount,
  scriptPubKey: escrowP2TR.output!, // provider needs this for witnessUtxo
};

// backend stores this and notifies provider.
type ProviderClaimPayload = {
  deposit_id: string;
  escrow_outpoint: { txid: string; vout: number; valueSats: number; scriptPubKeyHex: string };
  tapscript_hex: string;            // revealed script needed for signing/spend construction
  control_block_hex: string;         // merkle proof for that script leaf
};

const { revealedScript, controlBlock } = deriveRevealAndControlBlock(escrowLeaf);

const claimPayload: ProviderClaimPayload = {
  deposit_id: depositId,
  escrow_outpoint: {
    txid: escrowOutpoint.txid,
    vout: escrowOutpoint.vout,
    valueSats: escrowOutpoint.valueSats,
    scriptPubKeyHex: escrowOutpoint.scriptPubKey.toString("hex"),
  },
  tapscript_hex: Buffer.from(revealedScript).toString("hex"),
  control_block_hex: Buffer.from(controlBlock).toString("hex"),
};

console.log("Transmit to provider (payload):", claimPayload);

// ----------------- 2) PROVIDER CLAIM TX -----------------
// 2) Provider later spends the ESCROW outpoint (txid:vout) to a provider address (claims custody).
// Provider receives payload and builds a claim tx spending escrow_outpoint.

const providerReceive = bitcoin.payments.p2wpkh({ pubkey: providerPubkey, network });
if (!providerReceive.address) {
    throw new Error("No provider receive address");
}

const claimPsbt = new bitcoin.Psbt({ network });

// Rehydrate from transmitted payload
const escrowScriptPubKey = Buffer.from(claimPayload.escrow_outpoint.scriptPubKeyHex, "hex");
const escrowTapscript = Buffer.from(claimPayload.tapscript_hex, "hex");
const escrowControlBlock = Buffer.from(claimPayload.control_block_hex, "hex");

claimPsbt.addInput({
  hash: claimPayload.escrow_outpoint.txid,
  index: claimPayload.escrow_outpoint.vout,
  witnessUtxo: {
    script: escrowScriptPubKey,
    value: BigInt(claimPayload.escrow_outpoint.valueSats),
  },
  tapLeafScript: [
    {
      leafVersion: 0xc0,
      script: escrowTapscript,
      controlBlock: escrowControlBlock,
    },
  ],
});

// Output to provider address (minus fee)
const providerClaimFee = 2_000;
claimPsbt.addOutput({
  address: providerReceive.address,
  value: BigInt(claimPayload.escrow_outpoint.valueSats - providerClaimFee),
});

// Provider signs (for CHECKSIG in ELSE branch)
claimPsbt.signInput(0, providerKey);

// Finalize: choose ELSE branch by pushing "false" (empty vector) as OP_IF selector
claimPsbt.finalizeInput(0, (_idx, input) => {
  if (!input.tapScriptSig?.length) throw new Error("Missing tapScriptSig");
  const sig = input.tapScriptSig[0].signature;

  const witnessStack = [
    sig,
    Buffer.alloc(0),      // false => OP_ELSE branch
    escrowTapscript,
    escrowControlBlock,
  ];

  return {
    finalScriptWitness: bitcoin.script.witnessStackToScriptWitness(witnessStack),
  };
});

// "Broadcast" provider claim tx
const claimTx = claimPsbt.extractTransaction();
console.log("PROVIDER CLAIM txid:", claimTx.getId());
console.log("PROVIDER CLAIM tx hex:", claimTx.toHex());

// ----------------- 3) PROVIDER REPAYMENT TX -> RETURN SCRIPT -----------------
const returnScript = await locker.createTimelockScript(T, userPubkey);
const returnLeaf = leaf(returnScript);
const returnP2TR = p2trFromSundialLeaf(returnLeaf);

console.log("RETURN address:", returnP2TR.address);

// Provider has funds in their wallet after the claim tx.
const providerWalletUtxo = {
  txid: "22".repeat(32),
  vout: 1,
  valueSats: 100_000_000, // provider has enough funds from yield
  scriptPubKey: bitcoin.payments.p2wpkh({ pubkey: providerPubkey, network }).output!,
};

// Define repayment amount (principal + yield). Example: 0.88 BTC back into RETURN.
const repayAmount = 88_000_000; // 0.88 BTC
const repayFee = 2_000;
const repayChange = providerWalletUtxo.valueSats - (repayAmount + repayFee);
if (repayChange < 0) {
    throw new Error("Provider wallet UTXO insufficient for repayment");
}

const repayOpReturn = bitcoin.script.compile([
  bitcoin.opcodes.OP_RETURN,
  Buffer.from(depositId, "utf8"),
]);

const providerChangeAddr = bitcoin.payments.p2wpkh({ pubkey: providerPubkey, network }).address!;
const repayPsbt = new bitcoin.Psbt({ network });

repayPsbt.addInput({
  hash: providerWalletUtxo.txid,
  index: providerWalletUtxo.vout,
  witnessUtxo: {
    script: providerWalletUtxo.scriptPubKey,
    value: BigInt(providerWalletUtxo.valueSats),
  },
});

repayPsbt.addOutput({ script: returnP2TR.output!, value: BigInt(repayAmount) });
repayPsbt.addOutput({ script: repayOpReturn, value: BigInt(0) });
if (repayChange > 546) {
    repayPsbt.addOutput({ address: providerChangeAddr, value: BigInt(repayChange) });
}

repayPsbt.signInput(0, providerKey);
repayPsbt.finalizeAllInputs();

const repayTx = repayPsbt.extractTransaction();
const repayTxId = repayTx.getId();
console.log("PROVIDER REPAY txid:", repayTxId);
console.log("PROVIDER REPAY tx hex:", repayTx.toHex());

// The RETURN UTXO is created by this tx. In this demo it is vout=0 (first output).
const returnOutpoint = {
  txid: repayTxId,
  vout: 0,
  valueSats: repayAmount,
  scriptPubKey: returnP2TR.output!, // needed for user spend
};

// User needs to know the return outpoint + scripts to claim later.
// backend can discover this on-chain (Taproot namespace) and link via OP_RETURN depositId.
type UserClaimPayload = {
  deposit_id: string;
  return_outpoint: { txid: string; vout: number; valueSats: number; scriptPubKeyHex: string };
  tapscript_hex: string;
  control_block_hex: string;
  T: number;
};

const { revealedScript: returnRevealedScript, controlBlock: returnControlBlock } =
  deriveRevealAndControlBlock(returnLeaf);

const userClaimPayload: UserClaimPayload = {
  deposit_id: depositId,
  return_outpoint: {
    txid: returnOutpoint.txid,
    vout: returnOutpoint.vout,
    valueSats: returnOutpoint.valueSats,
    scriptPubKeyHex: returnOutpoint.scriptPubKey.toString("hex"),
  },
  tapscript_hex: Buffer.from(returnRevealedScript).toString("hex"),
  control_block_hex: Buffer.from(returnControlBlock).toString("hex"),
  T,
};

console.log("Transmit to user/backend (claim payload):", userClaimPayload);

// ----------------- 4) USER CLAIMS/SPENDS RETURN UTXO AFTER T -----------------

// User receives funds to a normal address they control
const userReceive = bitcoin.payments.p2wpkh({ pubkey: userPubkey, network });
if (!userReceive.address) throw new Error("No user receive address");

// Build user claim PSBT spending the RETURN P2TR output.
const claimReturnFee = 2_000;
const userClaimValue = userClaimPayload.return_outpoint.valueSats - claimReturnFee;
if (userClaimValue <= 0) {
    throw new Error("Return amount too small for fee");
}

// Rehydrate from payload
const returnScriptPubKey = Buffer.from(userClaimPayload.return_outpoint.scriptPubKeyHex, "hex");
const returnTapscript = Buffer.from(userClaimPayload.tapscript_hex, "hex");
const returnCB = Buffer.from(userClaimPayload.control_block_hex, "hex");

const userClaimPsbt = new bitcoin.Psbt({ network });

// Set locktime on the underlying transaction (bitcoinjs-lib supports setLocktime)
userClaimPsbt.setLocktime(userClaimPayload.T);

userClaimPsbt.addInput({
  hash: userClaimPayload.return_outpoint.txid,
  index: userClaimPayload.return_outpoint.vout,
  // sequence must be non-final to enable nLockTime
  sequence: 0xfffffffe,
  witnessUtxo: {
    script: returnScriptPubKey,
    value: BigInt(userClaimPayload.return_outpoint.valueSats),
  },
  tapLeafScript: [
    {
      leafVersion: 0xc0,
      script: returnTapscript,
      controlBlock: returnCB,
    },
  ],
});

userClaimPsbt.addOutput({
  address: userReceive.address,
  value: BigInt(userClaimValue),
});

// User signs with their key (required by <userPubkey> CHECKSIG)
userClaimPsbt.signInput(0, userKey);

// Finalize: single-leaf script, no OP_IF selector needed.
// Witness stack: [sig, script, controlBlock]
userClaimPsbt.finalizeInput(0, (_idx, input) => {
  if (!input.tapScriptSig?.length) throw new Error("Missing tapScriptSig");
  const sig = input.tapScriptSig[0].signature;

  const witnessStack = [
    sig,
    returnTapscript,
    returnCB,
  ];

  return {
    finalScriptWitness: bitcoin.script.witnessStackToScriptWitness(witnessStack),
  };
});

const userClaimTx = userClaimPsbt.extractTransaction();
console.log("USER CLAIM txid:", userClaimTx.getId());
console.log("USER CLAIM tx hex:", userClaimTx.toHex());

