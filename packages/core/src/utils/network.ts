// The network parameters live in `@sundial-protocol/btc-provider`, which has no
// dependency on bitcoinjs-lib. They have the same shape as bitcoinjs-lib's
// `Network`, so `NETWORKS.x.info` is passed to it directly throughout the locker;
// tests/network.test.ts checks the values match.
import {
  NETWORKS as PROVIDER_NETWORKS,
  type NetworkType,
} from "@sundial-protocol/btc-provider";

// The provider also knows testnet4. The locker has not been run there, so it
// keeps to the networks bitcoinjs-lib defines.
export const NETWORKS: { [key: string]: NetworkType } = {
  bitcoin: PROVIDER_NETWORKS.bitcoin,
  testnet: PROVIDER_NETWORKS.testnet,
  regtest: PROVIDER_NETWORKS.regtest,
};

export type { NetworkType };
