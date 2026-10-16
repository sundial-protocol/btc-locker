/**
 * Bitcoin API Service
 *
 * The implementation lives in `@sundial-protocol/btc-provider`. This module
 * re-exports it so `@sundial-protocol/btc-locker/bitcoin-api` and the named
 * `BitcoinAPI` export keep working.
 */

import {
  BitcoinAPI as BaseBitcoinAPI,
  type ApiProvider,
  type BitcoinAPIOptions,
  type NetworkName,
} from "@sundial-protocol/btc-provider";
import type { NetworkType } from "./utils/network.js";
import { FALLBACK_FEE_RATES } from "./utils/fees.js";

export type {
  ApiProvider,
  ApiUrls,
  AddressInfo,
  ApiUTXO,
  FeeEstimates,
  BroadcastResult,
} from "@sundial-protocol/btc-provider";

/**
 * The provider's class, typed with the locker's {@link NetworkType}. When no
 * provider answers a fee lookup it returns the locker's default rates
 * ({@link FALLBACK_FEE_RATES}), as the locker always has, unless the options
 * give other `fallbackFeeRates`.
 */
export default class BitcoinAPI extends BaseBitcoinAPI<NetworkType> {
  constructor(
    network: NetworkType | NetworkName,
    apiProvider?: ApiProvider | ApiProvider[],
    options: BitcoinAPIOptions = {},
  ) {
    super(network, apiProvider, {
      fallbackFeeRates: FALLBACK_FEE_RATES,
      ...options,
    });
  }
}
