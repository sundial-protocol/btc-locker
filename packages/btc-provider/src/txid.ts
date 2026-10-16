/**
 * The id of a raw transaction, computed locally so a broadcast the provider
 * already knows about can still report its txid.
 */

import { Transaction } from "bitcoinjs-lib";
import { fromHex } from "./bytes.js";

/**
 * The transaction id of a raw transaction: the double SHA-256 of its
 * serialization without witness data, byte-reversed, as hex.
 *
 * @throws If `txHex` is not hex, or not a whole transaction.
 */
export function transactionId(txHex: string): string {
  const tx = fromHex(txHex.trim(), "Transaction is not valid hex");
  try {
    return Transaction.fromBuffer(tx).getId();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Transaction could not be parsed: ${reason}`);
  }
}
