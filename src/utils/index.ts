import FeeUtils from "./fees.js";
import TimeUtils from "./time.js";
import KeyUtils from "./keys.js";
import ValidationUtils from "./validation.js";
import TransactionUtils from "./transactions.js";
import ScriptUtils from "./scripts.js";
import MetadataUtils from "./metadata.js";

export {
  FeeUtils,
  TimeUtils,
  KeyUtils,
  ValidationUtils,
  TransactionUtils,
  ScriptUtils,
  MetadataUtils,
};

// Combined Utils object containing all utilities
export const Utils = {
  Fees: FeeUtils,
  Time: TimeUtils,
  Keys: KeyUtils,
  Validation: ValidationUtils,
  Transaction: TransactionUtils,
  Script: ScriptUtils,
  Metadata: MetadataUtils,
};
