import { describe, test, expect } from "vitest";
import * as bitcoin from "bitcoinjs-lib";
import { NETWORKS } from "../src/utils/network";

describe("NETWORKS", () => {
  test.each(["bitcoin", "testnet", "regtest"] as const)(
    "%s parameters equal bitcoinjs-lib's",
    (name) => {
      expect(NETWORKS[name].name).toBe(name);
      expect(NETWORKS[name].info).toEqual(bitcoin.networks[name]);
    },
  );

  test("covers exactly the networks bitcoinjs-lib defines", () => {
    expect(Object.keys(NETWORKS).sort()).toEqual(
      Object.keys(bitcoin.networks).sort(),
    );
  });

  test("bitcoinjs-lib accepts the parameters", () => {
    const pubkey = Buffer.from(
      "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
      "hex",
    );
    for (const name of ["bitcoin", "testnet", "regtest"] as const) {
      const ours = bitcoin.payments.p2wpkh({ pubkey, network: NETWORKS[name].info });
      const theirs = bitcoin.payments.p2wpkh({ pubkey, network: bitcoin.networks[name] });
      expect(ours.address).toBe(theirs.address);
    }
  });
});
