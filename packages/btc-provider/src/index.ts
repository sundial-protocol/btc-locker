/**
 * @sundial-protocol/btc-provider
 *
 * Client for public Bitcoin HTTP APIs with provider switching. Extracted from
 * `@sundial-protocol/btc-locker`, which re-exports it unchanged.
 */

import BitcoinAPI from "./bitcoin-api.js";

export { BitcoinAPIError } from "./bitcoin-api.js";
export { transactionId } from "./txid.js";

export type {
  ApiProvider,
  ApiUrls,
  AddressInfo,
  ApiUTXO,
  FeeEstimates,
  BroadcastResult,
  BitcoinAPIOptions,
} from "./bitcoin-api.js";

export {
  NETWORKS,
  type BitcoinNetwork,
  type Network,
  type NetworkName,
  type NetworkType,
} from "./network.js";

export { BitcoinAPI };
export default BitcoinAPI;
