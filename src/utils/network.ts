import {Network, networks} from "bitcoinjs-lib";

export type NetworkType = {
  info: Network;
  name: "bitcoin" | "testnet" | "regtest";
}

export const NETWORKS: { [key: string]: NetworkType } = {
  bitcoin: { info: networks.bitcoin, name: "bitcoin" },
  testnet: { info: networks.testnet, name: "testnet" },
  regtest: { info: networks.regtest, name: "regtest" },
};