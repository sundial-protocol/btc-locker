import { describe, test, expect } from "vitest";
import { TransactionUtils, type ApiUTXO, type UTXO } from "../src/index";

// `ApiUTXO` extended `UTXO` before it moved to @sundial-protocol/btc-provider,
// which cannot import the locker's types. `npm run type-check` fails here if a
// `UTXO` field is missing from it.
type MissingFromApiUTXO = Exclude<keyof UTXO, keyof ApiUTXO>;
const noneMissing: [MissingFromApiUTXO] extends [never] ? true : false = true;

describe("ApiUTXO", () => {
  test("carries every UTXO field", () => {
    expect(noneMissing).toBe(true);
  });

  test("can be enriched and passed to the locker's UTXO selection", () => {
    const fromApi: ApiUTXO = {
      txid: "a".repeat(64),
      vout: 0,
      value: 50_000,
      status: { confirmed: true, block_height: 100 },
    };
    const spendable: ApiUTXO = { ...fromApi, vout: 1, scriptPubKey: "0014" + "00".repeat(20) };
    const reserved: ApiUTXO = { ...fromApi, vout: 2, value: 90_000, doNotSpend: true };

    const selected: UTXO[] = TransactionUtils.selectUtxos([spendable, reserved], 10_000);
    expect(selected).toEqual([spendable]);
  });
});
