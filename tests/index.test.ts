import { describe, test, expect } from "vitest";
import {
  BTCLocker,
  BTCLockerCore,
  KeyPairGenerator,
  TransactionManager,
  BitcoinAPI,
  TimeUtils,
  ScriptUtils,
  TransactionUtils,
  KeyUtils,
  FeeUtils,
  ValidationUtils,
  MetadataUtils,
  Utils,
  BTCLockerError,
  ValidationError,
  TimelockError,
  createBTCLocker,
  NETWORKS,
  FeePriorities,
  TxType,
  packMetadata,
  unpackMetadata,
  ScriptManager,
} from "../src/index";
import defaultExport from "../src/index";

describe("src/index.ts exports", () => {
  test("should export all main classes", () => {
    expect(BTCLocker).toBeDefined();
    expect(BTCLockerCore).toBeDefined();
    expect(KeyPairGenerator).toBeDefined();
    expect(TransactionManager).toBeDefined();
    expect(BitcoinAPI).toBeDefined();
    expect(ScriptManager).toBeDefined();
  });

  test("should export all utility classes", () => {
    expect(TimeUtils).toBeDefined();
    expect(ScriptUtils).toBeDefined();
    expect(TransactionUtils).toBeDefined();
    expect(KeyUtils).toBeDefined();
    expect(FeeUtils).toBeDefined();
    expect(ValidationUtils).toBeDefined();
    expect(MetadataUtils).toBeDefined();
    expect(Utils).toBeDefined();
  });

  test("should export error classes", () => {
    expect(BTCLockerError).toBeDefined();
    expect(ValidationError).toBeDefined();
    expect(TimelockError).toBeDefined();
  });

  test("should export enums and constants", () => {
    expect(NETWORKS).toBeDefined();
    expect(FeePriorities).toBeDefined();
    expect(TxType).toBeDefined();
  });

  test("should export metadata functions", () => {
    expect(typeof packMetadata).toBe("function");
    expect(typeof unpackMetadata).toBe("function");
  });

  test("should export createBTCLocker factory", () => {
    expect(typeof createBTCLocker).toBe("function");
  });

  test("createBTCLocker should return initialized instance", async () => {
    const locker = await createBTCLocker("testnet");
    expect(locker).toBeInstanceOf(BTCLocker);
    expect(locker.initialized).toBe(true);
  });

  test("createBTCLocker should default to testnet", async () => {
    const locker = await createBTCLocker();
    expect(locker).toBeInstanceOf(BTCLocker);
  });

  test("should export default object with all members", () => {
    expect(defaultExport).toBeDefined();
    expect(defaultExport.BTCLocker).toBeDefined();
    expect(defaultExport.createBTCLocker).toBeDefined();
    expect(defaultExport.TimeUtils).toBeDefined();
    expect(defaultExport.BTCLockerError).toBeDefined();
  });
});
