/**
 * @sundial-protocol/bitcoin-api
 *
 * Client for public Bitcoin HTTP APIs with provider switching. Extracted from
 * `@sundial-protocol/btc-locker`, which re-exports it unchanged.
 */

import BitcoinAPI from "./bitcoin-api.js";

export type {
  ApiProvider,
  ApiUrls,
  AddressInfo,
  ApiUTXO,
  BitcoinNetwork,
  FeeEstimates,
  BroadcastResult,
} from "./bitcoin-api.js";

export { BitcoinAPI };
export default BitcoinAPI;
