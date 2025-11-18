const {
  BTCLocker,
  TimeUtils,
  ScriptUtils,
  TransactionUtils,
} = require("../src/index");
const bitcoin = require("bitcoinjs-lib");

describe("BTCLocker", () => {
  let locker;

  beforeEach(() => {
    locker = new BTCLocker(bitcoin.networks.testnet);
  });

  describe("Key Generation", () => {
    test("should generate valid key pair", () => {
      const keyPair = locker.generateKeyPair();

      expect(keyPair).toHaveProperty("privateKey");
      expect(keyPair).toHaveProperty("publicKey");
      expect(keyPair).toHaveProperty("address");
      expect(ScriptUtils.isValidPrivateKey(keyPair.privateKey)).toBe(true);
      expect(ScriptUtils.isValidPublicKey(keyPair.publicKey)).toBe(true);
      expect(
        ScriptUtils.isValidAddress(keyPair.address, bitcoin.networks.testnet)
      ).toBe(true);
    });
  });

  describe("Timelock Scripts", () => {
    test("should create simple timelock script", () => {
      const keyPair = locker.generateKeyPair();
      const locktime = TimeUtils.addDuration(TimeUtils.DURATIONS.DAY);
      const script = locker.createTimelockScript(locktime, keyPair.publicKey);

      expect(script).toHaveProperty("redeemScript");
      expect(script).toHaveProperty("address");
      expect(script).toHaveProperty("locktime", locktime);
      expect(script).toHaveProperty("type", "timelock");
      expect(
        ScriptUtils.isValidAddress(script.address, bitcoin.networks.testnet)
      ).toBe(true);
    });

    test("should create relative timelock script", () => {
      const keyPair = locker.generateKeyPair();
      const sequence = 144; // ~1 day
      const script = locker.createRelativeTimelockScript(
        sequence,
        keyPair.publicKey
      );

      expect(script).toHaveProperty("redeemScript");
      expect(script).toHaveProperty("address");
      expect(script).toHaveProperty("sequence", sequence);
      expect(script).toHaveProperty("type", "relative-timelock");
    });

    test("should create multisig timelock script", () => {
      const keyPair1 = locker.generateKeyPair();
      const keyPair2 = locker.generateKeyPair();
      const keyPair3 = locker.generateKeyPair();
      const publicKeys = [
        keyPair1.publicKey,
        keyPair2.publicKey,
        keyPair3.publicKey,
      ];
      const locktime = TimeUtils.addDuration(TimeUtils.DURATIONS.WEEK);

      const script = locker.createMultisigTimelockScript(
        locktime,
        2,
        publicKeys
      );

      expect(script).toHaveProperty("redeemScript");
      expect(script).toHaveProperty("address");
      expect(script).toHaveProperty("m", 2);
      expect(script).toHaveProperty("publicKeys");
      expect(script.publicKeys).toHaveLength(3);
      expect(script).toHaveProperty("type", "multisig-timelock");
    });

    test("should create HODL script", () => {
      const ownerKeyPair = locker.generateKeyPair();
      const penaltyKeyPair = locker.generateKeyPair();
      const locktime = TimeUtils.addDuration(TimeUtils.DURATIONS.YEAR);

      const script = locker.createHodlScript(
        locktime,
        ownerKeyPair.publicKey,
        penaltyKeyPair.publicKey
      );

      expect(script).toHaveProperty("redeemScript");
      expect(script).toHaveProperty("address");
      expect(script).toHaveProperty("ownerPubKey");
      expect(script).toHaveProperty("penaltyPubKey");
      expect(script).toHaveProperty("type", "hodl");
    });
  });

  describe("Timelock Validation", () => {
    test("should correctly validate timelock expiry", () => {
      const pastTime = TimeUtils.addDuration(-TimeUtils.DURATIONS.DAY);
      const futureTime = TimeUtils.addDuration(TimeUtils.DURATIONS.DAY);

      expect(locker.isTimelockExpired(pastTime)).toBe(true);
      expect(locker.isTimelockExpired(futureTime)).toBe(false);
    });

    test("should throw error for block height validation", () => {
      expect(() => locker.isTimelockExpired(100000)).toThrow();
    });
  });
});

describe("TimeUtils", () => {
  test("should convert date to timestamp", () => {
    const date = new Date("2025-01-01T00:00:00Z");
    const timestamp = TimeUtils.dateToTimestamp(date);
    expect(timestamp).toBe(1735689600);
  });

  test("should convert timestamp to date", () => {
    const timestamp = 1735689600; // 2025-01-01T00:00:00Z
    const date = TimeUtils.timestampToDate(timestamp);
    expect(date.getUTCFullYear()).toBe(2025);
    expect(date.getUTCMonth()).toBe(0); // January
    expect(date.getUTCDate()).toBe(1);
  });

  test("should add duration correctly", () => {
    const baseTime = 1000000000;
    const result = TimeUtils.addDuration(TimeUtils.DURATIONS.DAY, baseTime);
    expect(result).toBe(baseTime + TimeUtils.DURATIONS.DAY);
  });

  test("should convert blocks to seconds", () => {
    const blocks = 144;
    const seconds = TimeUtils.blocksToSeconds(blocks);
    expect(seconds).toBe(144 * 600); // 144 blocks * 10 minutes
  });
});

describe("ScriptUtils", () => {
  test("should validate public keys", () => {
    const validCompressedKey =
      "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
    const invalidKey = "invalid";

    expect(ScriptUtils.isValidPublicKey(validCompressedKey)).toBe(true);
    expect(ScriptUtils.isValidPublicKey(invalidKey)).toBe(false);
  });

  test("should validate private keys", () => {
    const validPrivateKey =
      "e9873d79c6d87dc0fb6a5778633389f4453213303da61f20bd67fc233aa33262";
    const invalidKey = "invalid";

    expect(ScriptUtils.isValidPrivateKey(validPrivateKey)).toBe(true);
    expect(ScriptUtils.isValidPrivateKey(invalidKey)).toBe(false);
  });
});

describe("TransactionUtils", () => {
  test("should estimate transaction fee", () => {
    const fee = TransactionUtils.estimateFee(1, 1, 10);
    expect(fee).toBeGreaterThan(0);
    expect(typeof fee).toBe("number");
  });

  test("should convert between BTC and satoshis", () => {
    const btc = 1.5;
    const satoshis = 150000000;

    expect(TransactionUtils.btcToSatoshis(btc)).toBe(satoshis);
    expect(TransactionUtils.satoshisToBTC(satoshis)).toBe(btc);
  });
});
