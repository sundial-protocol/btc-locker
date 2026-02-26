import FeeUtils from './fees';
import TimeUtils from './time';
import KeyUtils from './keys';
import ValidationUtils from './validation';
import TransactionUtils from './transactions';
import ScriptUtils from './scripts';
export { SUNDIAL_NAMESPACE_XONLY, TAPROOT_LEAF_VERSION } from './scripts';

export { FeeUtils, TimeUtils, KeyUtils, ValidationUtils, TransactionUtils, ScriptUtils };

// Combined Utils object containing all utilities
export const Utils = {
  Fees: FeeUtils,
  Time: TimeUtils,
  Keys: KeyUtils,
  Validation: ValidationUtils,
  Transaction: TransactionUtils,
  Script: ScriptUtils,
};

