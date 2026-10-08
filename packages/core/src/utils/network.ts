// The network parameters live in `@sundial-protocol/bitcoin-api`, which has no
// dependency on bitcoinjs-lib. They have the same shape as bitcoinjs-lib's
// `Network`, so `NETWORKS.x.info` is passed to it directly throughout the locker;
// tests/network.test.ts checks the values match.
export { NETWORKS, type NetworkType } from "@sundial-protocol/bitcoin-api";
