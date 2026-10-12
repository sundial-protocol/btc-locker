/**
 * Bitcoin API Service
 *
 * The implementation lives in `@sundial-protocol/btc-provider`. This module
 * re-exports it so `@sundial-protocol/btc-locker/bitcoin-api` and the named
 * `BitcoinAPI` export keep working.
 */

import { BitcoinAPI as BaseBitcoinAPI } from "@sundial-protocol/btc-provider";
import type { NetworkType } from "./utils/network.js";

export type {
  ApiProvider,
  ApiUrls,
  AddressInfo,
  ApiUTXO,
  FeeEstimates,
  BroadcastResult,
} from "@sundial-protocol/btc-provider";

/** The same class, typed with the locker's {@link NetworkType}. */
const BitcoinAPI = BaseBitcoinAPI<NetworkType>;
type BitcoinAPI = BaseBitcoinAPI<NetworkType>;

export default BitcoinAPI;
