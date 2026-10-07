/**
 * Bitcoin network parameters.
 *
 * These are plain data with the same shape and values as `bitcoinjs-lib`'s
 * `Network` objects, defined here so this package has no dependencies. A
 * `NetworkType.info` can be passed to `bitcoinjs-lib` as is. btc-locker's tests
 * check the values against `bitcoinjs-lib`.
 */

/** Address prefixes and version bytes for one network. Matches `bitcoinjs-lib`'s `Network`. */
export interface Network {
  messagePrefix: string;
  bech32: string;
  bip32: {
    public: number;
    private: number;
  };
  pubKeyHash: number;
  scriptHash: number;
  wif: number;
}

/** The names of the networks this package knows. */
export type NetworkName = "bitcoin" | "testnet" | "regtest";

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

const MESSAGE_PREFIX = "\x18Bitcoin Signed Message:\n";

const bitcoin: Network = {
  messagePrefix: MESSAGE_PREFIX,
  bech32: "bc",
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  pubKeyHash: 0x00,
  scriptHash: 0x05,
  wif: 0x80,
};

const testnet: Network = {
  messagePrefix: MESSAGE_PREFIX,
  bech32: "tb",
  bip32: { public: 0x043587cf, private: 0x04358394 },
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
};

const regtest: Network = {
  ...testnet,
  bip32: { ...testnet.bip32 },
  bech32: "bcrt",
};

export const NETWORKS: { [key: string]: NetworkType } = {
  bitcoin: { info: bitcoin, name: "bitcoin" },
  testnet: { info: testnet, name: "testnet" },
  regtest: { info: regtest, name: "regtest" },
};
