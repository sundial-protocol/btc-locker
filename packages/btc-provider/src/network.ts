/**
 * Bitcoin network parameters: `bitcoinjs-lib`'s own `Network` objects, under
 * the names this package uses.
 */

import { networks, type Network } from "bitcoinjs-lib";

export type { Network };

/** The names of the networks this package knows. `testnet` is testnet3. */
export type NetworkName = "bitcoin" | "testnet" | "testnet4" | "regtest";

/**
 * The least a {@link BitcoinAPI} needs to know about a network: its name.
 * A {@link NetworkType} satisfies it.
 */
export interface BitcoinNetwork {
  name: NetworkName;
}

/** A named network together with its parameters. */
export type NetworkType = {
  info: Network;
  name: NetworkName;
};

export const NETWORKS: { [key: string]: NetworkType } = {
  bitcoin: { info: networks.bitcoin, name: "bitcoin" },
  testnet: { info: networks.testnet, name: "testnet" },
  // testnet4 has testnet3's address prefixes and version bytes.
  testnet4: { info: networks.testnet, name: "testnet4" },
  regtest: { info: networks.regtest, name: "regtest" },
};
