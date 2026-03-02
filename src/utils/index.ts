import FeeUtils from './fees';
import TimeUtils from './time';
import KeyUtils from './keys';
import ValidationUtils from './validation';
import TransactionUtils from './transactions';
import ScriptUtils from './scripts';
import MetadataUtils from './metadata';

export { FeeUtils, TimeUtils, KeyUtils, ValidationUtils, TransactionUtils, ScriptUtils, MetadataUtils };

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

