import { describe, test, expect, beforeAll, vi } from "vitest";
import { BTCLockerCore, initECC, getECC } from "../src/locker/core";
import { NETWORKS } from "../src/utils/network";
import * as bitcoin from "bitcoinjs-lib";
import tinysecp from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";

describe("BTCLockerCore", () => {
  describe("initECC", () => {
    test("should initialize ECC library", async () => {
      const result = await initECC();
      expect(result).toHaveProperty("ecc");
      expect(result).toHaveProperty("bip32");
      expect(result).toHaveProperty("ECPair");
    });

    test("should return same instance on subsequent calls", async () => {
      const first = await initECC();
      const second = await initECC();
      expect(first.ecc).toBe(second.ecc);
    });
  });

  describe("getECC", () => {
    test("should return initialized ECC after initECC", async () => {
      await initECC();
      const result = getECC();
      expect(result).toHaveProperty("ecc");
      expect(result).toHaveProperty("bip32");
      expect(result).toHaveProperty("ECPair");
    });
  });

  describe("constructor", () => {
    test("should create with default network", () => {
      const core = new BTCLockerCore();
      expect(core.network).toBe(bitcoin.networks.bitcoin);
      expect(core.initialized).toBe(false);
    });

    test("should create with testnet", () => {
      const core = new BTCLockerCore(NETWORKS.testnet);
      expect(core.network).toBe(bitcoin.networks.testnet);
    });

    test("should throw for regtest (unsupported by API)", () => {
      expect(() => new BTCLockerCore(NETWORKS.regtest)).toThrow(
        "Regtest network is not supported",
      );
    });
  });

  describe("init", () => {
    test("should initialize successfully", async () => {
      const core = new BTCLockerCore(NETWORKS.testnet);
      await core.init();
      expect(core.initialized).toBe(true);
    });

    test("should not re-initialize if already initialized", async () => {
      const core = new BTCLockerCore(NETWORKS.testnet);
      await core.init();
      await core.init(); // Second call should be a no-op
      expect(core.initialized).toBe(true);
    });
  });

  describe("signTransaction", () => {
    test("should throw for empty psbt string", async () => {
      const core = new BTCLockerCore(NETWORKS.testnet);
      await core.init();
      await expect(core.signTransaction("", "abcd")).rejects.toThrow(
        "unsignedPsbt is required and must be a string",
      );
    });

    test("should throw for non-string psbt", async () => {
      const core = new BTCLockerCore(NETWORKS.testnet);
      await core.init();
      await expect(core.signTransaction(null as any, "abcd")).rejects.toThrow(
        "unsignedPsbt is required and must be a string",
      );
    });

    test("should throw for empty private keys array", async () => {
      const core = new BTCLockerCore(NETWORKS.testnet);
      await core.init();
      await expect(core.signTransaction("cHNidAA=", [])).rejects.toThrow(
        "At least one private key is required",
      );
    });

    test("should throw for invalid private key in array", async () => {
      const core = new BTCLockerCore(NETWORKS.testnet);
      await core.init();
      // Create a valid PSBT first
      const ecc = (tinysecp as any).default || tinysecp;
      const ECPair = ECPairFactory(ecc);
      const kp = ECPair.makeRandom({
        network: bitcoin.networks.testnet,
        compressed: true,
      });
      const p2wpkh = bitcoin.payments.p2wpkh({
        pubkey: kp.publicKey,
        network: bitcoin.networks.testnet,
      });
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });
      psbt.addInput({
        hash: "a".repeat(64),
        index: 0,
        witnessUtxo: { script: p2wpkh.output!, value: BigInt(50000) },
      });
      psbt.addOutput({ address: p2wpkh.address!, value: BigInt(45000) });
      const psbtBase64 = psbt.toBase64();

      await expect(
        core.signTransaction(psbtBase64, [null as any]),
      ).rejects.toThrow("All private keys must be valid hex strings");
    });

    test("should sign a valid P2WPKH transaction", async () => {
      const core = new BTCLockerCore(NETWORKS.testnet);
      await core.init();

      const ecc = (tinysecp as any).default || tinysecp;
      const ECPair = ECPairFactory(ecc);
      const kp = ECPair.makeRandom({
        network: bitcoin.networks.testnet,
        compressed: true,
      });
      const p2wpkh = bitcoin.payments.p2wpkh({
        pubkey: kp.publicKey,
        network: bitcoin.networks.testnet,
      });

      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });
      psbt.addInput({
        hash: "a".repeat(64),
        index: 0,
        witnessUtxo: { script: p2wpkh.output!, value: BigInt(50000) },
      });
      psbt.addOutput({ address: p2wpkh.address!, value: BigInt(45000) });

      const psbtBase64 = psbt.toBase64();
      const privateKeyHex = kp.privateKey!.toString("hex");

      const signedHex = await core.signTransaction(psbtBase64, privateKeyHex);
      expect(typeof signedHex).toBe("string");
      expect(signedHex.length).toBeGreaterThan(0);

      // Verify it's a valid transaction hex
      const tx = bitcoin.Transaction.fromHex(signedHex);
      expect(tx.ins).toHaveLength(1);
      expect(tx.outs).toHaveLength(1);
    });

    test("should sign with empty witnessUtxo script (auto-fill)", async () => {
      const core = new BTCLockerCore(NETWORKS.testnet);
      await core.init();

      const ecc = (tinysecp as any).default || tinysecp;
      const ECPair = ECPairFactory(ecc);
      const kp = ECPair.makeRandom({
        network: bitcoin.networks.testnet,
        compressed: true,
      });
      const p2wpkh = bitcoin.payments.p2wpkh({
        pubkey: kp.publicKey,
        network: bitcoin.networks.testnet,
      });

      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });
      psbt.addInput({
        hash: "a".repeat(64),
        index: 0,
        witnessUtxo: {
          script: Buffer.alloc(0), // Empty script - should be auto-filled
          value: BigInt(50000),
        },
      });
      psbt.addOutput({ address: p2wpkh.address!, value: BigInt(45000) });

      const psbtBase64 = psbt.toBase64();
      const signedHex = await core.signTransaction(
        psbtBase64,
        kp.privateKey!.toString("hex"),
      );
      expect(typeof signedHex).toBe("string");
      expect(signedHex.length).toBeGreaterThan(0);
    });

    test("should sign multiple inputs with multiple keys", async () => {
      const core = new BTCLockerCore(NETWORKS.testnet);
      await core.init();

      const ecc = (tinysecp as any).default || tinysecp;
      const ECPair = ECPairFactory(ecc);
      const kp1 = ECPair.makeRandom({
        network: bitcoin.networks.testnet,
        compressed: true,
      });
      const kp2 = ECPair.makeRandom({
        network: bitcoin.networks.testnet,
        compressed: true,
      });
      const p2wpkh1 = bitcoin.payments.p2wpkh({
        pubkey: kp1.publicKey,
        network: bitcoin.networks.testnet,
      });
      const p2wpkh2 = bitcoin.payments.p2wpkh({
        pubkey: kp2.publicKey,
        network: bitcoin.networks.testnet,
      });

      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });
      psbt.addInput({
        hash: "a".repeat(64),
        index: 0,
        witnessUtxo: { script: p2wpkh1.output!, value: BigInt(50000) },
      });
      psbt.addInput({
        hash: "b".repeat(64),
        index: 0,
        witnessUtxo: { script: p2wpkh2.output!, value: BigInt(50000) },
      });
      psbt.addOutput({ address: p2wpkh1.address!, value: BigInt(90000) });

      const signedHex = await core.signTransaction(psbt.toBase64(), [
        kp1.privateKey!.toString("hex"),
        kp2.privateKey!.toString("hex"),
      ]);
      const tx = bitcoin.Transaction.fromHex(signedHex);
      expect(tx.ins).toHaveLength(2);
    });

    test("should sign P2SH input with redeemScript (simple)", async () => {
      const core = new BTCLockerCore(NETWORKS.testnet);
      await core.init();

      const ecc = (tinysecp as any).default || tinysecp;
      const ECPair = ECPairFactory(ecc);
      const kp = ECPair.makeRandom({
        network: bitcoin.networks.testnet,
        compressed: true,
      });

      // Simple redeemScript: <pubkey> OP_CHECKSIG (no conditional logic)
      const redeemScript = bitcoin.script.compile([
        kp.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);
      const scriptHash = bitcoin.crypto.hash160(redeemScript);
      const p2shScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_HASH160,
        scriptHash,
        bitcoin.opcodes.OP_EQUAL,
      ]);

      // Create a fake prev tx that pays to the P2SH address
      const prevTx = new bitcoin.Transaction();
      prevTx.addInput(Buffer.alloc(32), 0);
      prevTx.addOutput(p2shScript, BigInt(50000));
      const nonWitnessUtxo = prevTx.toBuffer();

      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });
      psbt.addInput({
        hash: prevTx.getId(),
        index: 0,
        nonWitnessUtxo,
        redeemScript,
      });
      const destPayment = bitcoin.payments.p2wpkh({
        pubkey: kp.publicKey,
        network: bitcoin.networks.testnet,
      });
      psbt.addOutput({ address: destPayment.address!, value: BigInt(45000) });

      const signedHex = await core.signTransaction(
        psbt.toBase64(),
        kp.privateKey!.toString("hex"),
      );
      expect(typeof signedHex).toBe("string");
      expect(signedHex.length).toBeGreaterThan(0);
    });

    test("should sign P2SH input with conditional escrow script", async () => {
      const core = new BTCLockerCore(NETWORKS.testnet);
      await core.init();

      const ecc = (tinysecp as any).default || tinysecp;
      const ECPair = ECPairFactory(ecc);
      const kp = ECPair.makeRandom({
        network: bitcoin.networks.testnet,
        compressed: true,
      });

      // Escrow-style script with OP_IF
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600;
      const redeemScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_IF,
        bitcoin.script.number.encode(pastTimestamp),
        bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
        bitcoin.opcodes.OP_DROP,
        kp.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
        bitcoin.opcodes.OP_ELSE,
        kp.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
        bitcoin.opcodes.OP_ENDIF,
      ]);
      const scriptHash = bitcoin.crypto.hash160(redeemScript);
      const p2shScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_HASH160,
        scriptHash,
        bitcoin.opcodes.OP_EQUAL,
      ]);

      // Create a fake prev tx that pays to the P2SH address
      const prevTx = new bitcoin.Transaction();
      prevTx.addInput(Buffer.alloc(32), 0);
      prevTx.addOutput(p2shScript, BigInt(50000));
      const nonWitnessUtxo = prevTx.toBuffer();

      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });
      psbt.addInput({
        hash: prevTx.getId(),
        index: 0,
        nonWitnessUtxo,
        redeemScript,
      });
      const destPayment = bitcoin.payments.p2wpkh({
        pubkey: kp.publicKey,
        network: bitcoin.networks.testnet,
      });
      psbt.addOutput({ address: destPayment.address!, value: BigInt(45000) });

      const signedHex = await core.signTransaction(
        psbt.toBase64(),
        kp.privateKey!.toString("hex"),
      );
      expect(typeof signedHex).toBe("string");
      expect(signedHex.length).toBeGreaterThan(0);
    });

    test("should sign escrow script with spendAfterDeadline false", async () => {
      const core = new BTCLockerCore(NETWORKS.testnet);
      await core.init();

      const ecc = (tinysecp as any).default || tinysecp;
      const ECPair = ECPairFactory(ecc);
      const kp = ECPair.makeRandom({
        network: bitcoin.networks.testnet,
        compressed: true,
      });

      const redeemScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_IF,
        kp.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
        bitcoin.opcodes.OP_ELSE,
        kp.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
        bitcoin.opcodes.OP_ENDIF,
      ]);
      const scriptHash = bitcoin.crypto.hash160(redeemScript);
      const p2shScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_HASH160,
        scriptHash,
        bitcoin.opcodes.OP_EQUAL,
      ]);

      // Create a fake prev tx
      const prevTx = new bitcoin.Transaction();
      prevTx.addInput(Buffer.alloc(32), 0);
      prevTx.addOutput(p2shScript, BigInt(50000));
      const nonWitnessUtxo = prevTx.toBuffer();

      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });
      psbt.addInput({
        hash: prevTx.getId(),
        index: 0,
        nonWitnessUtxo,
        redeemScript,
      });
      const destPayment = bitcoin.payments.p2wpkh({
        pubkey: kp.publicKey,
        network: bitcoin.networks.testnet,
      });
      psbt.addOutput({ address: destPayment.address!, value: BigInt(45000) });

      const signedHex = await core.signTransaction(
        psbt.toBase64(),
        kp.privateKey!.toString("hex"),
        { spendAfterDeadline: false },
      );
      expect(typeof signedHex).toBe("string");
    });
  });

  describe("submitTransaction", () => {
    test("should throw for empty transaction hex", async () => {
      const core = new BTCLockerCore(NETWORKS.testnet);
      await core.init();
      await expect(core.submitTransaction("")).rejects.toThrow(
        "transactionHex is required and must be a string",
      );
    });

    test("should throw for non-string transaction hex", async () => {
      const core = new BTCLockerCore(NETWORKS.testnet);
      await core.init();
      await expect(core.submitTransaction(null as any)).rejects.toThrow(
        "transactionHex is required and must be a string",
      );
    });

    test("should submit transaction with mocked broadcast", async () => {
      const core = new BTCLockerCore(NETWORKS.testnet);
      await core.init();

      // Create a valid transaction hex
      const ecc = (tinysecp as any).default || tinysecp;
      const ECPair = ECPairFactory(ecc);
      const kp = ECPair.makeRandom({
        network: bitcoin.networks.testnet,
        compressed: true,
      });
      const p2wpkh = bitcoin.payments.p2wpkh({
        pubkey: kp.publicKey,
        network: bitcoin.networks.testnet,
      });

      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });
      psbt.addInput({
        hash: "a".repeat(64),
        index: 0,
        witnessUtxo: { script: p2wpkh.output!, value: BigInt(50000) },
      });
      psbt.addOutput({ address: p2wpkh.address!, value: BigInt(45000) });
      psbt.signInput(0, kp);
      psbt.finalizeAllInputs();
      const txHex = psbt.extractTransaction().toHex();
      const expectedTxid = psbt.extractTransaction().getId();

      // Mock the API broadcast
      core.api.broadcastTransaction = vi
        .fn()
        .mockResolvedValue({ txid: "broadcast-txid-123" });

      const result = await core.submitTransaction(txHex);
      expect(result).toBe("broadcast-txid-123");
      expect(core.api.broadcastTransaction).toHaveBeenCalledWith(txHex);
    });

    test("should return local txid when broadcast returns no txid", async () => {
      const core = new BTCLockerCore(NETWORKS.testnet);
      await core.init();

      const tx = new bitcoin.Transaction();
      tx.addInput(Buffer.alloc(32), 0);
      tx.addOutput(Buffer.alloc(25), BigInt(1000));
      const txHex = tx.toHex();

      core.api.broadcastTransaction = vi.fn().mockResolvedValue({ txid: "" });

      const result = await core.submitTransaction(txHex);
      // Falls back to local txid when broadcast returns empty
      expect(typeof result).toBe("string");
    });

    test("should throw on broadcast failure", async () => {
      const core = new BTCLockerCore(NETWORKS.testnet);
      await core.init();

      const tx = new bitcoin.Transaction();
      tx.addInput(Buffer.alloc(32), 0);
      tx.addOutput(Buffer.alloc(25), BigInt(1000));
      const txHex = tx.toHex();

      core.api.broadcastTransaction = vi
        .fn()
        .mockRejectedValue(new Error("rejected by network"));

      await expect(core.submitTransaction(txHex)).rejects.toThrow(
        "Failed to broadcast transaction",
      );
    });

    test("should use custom api from options", async () => {
      const core = new BTCLockerCore(NETWORKS.testnet);
      await core.init();

      const tx = new bitcoin.Transaction();
      tx.addInput(Buffer.alloc(32), 0);
      tx.addOutput(Buffer.alloc(25), BigInt(1000));
      const txHex = tx.toHex();

      const customApi = {
        broadcastTransaction: vi
          .fn()
          .mockResolvedValue({ txid: "custom-txid" }),
      };

      const result = await core.submitTransaction(txHex, {
        api: customApi as any,
      });
      expect(result).toBe("custom-txid");
      expect(customApi.broadcastTransaction).toHaveBeenCalledWith(txHex);
    });
  });
});
