import { defineConfig } from "vitest/config";

// The regtest suite needs bitcoind running: `npm run regtest` starts it, runs
// the suite and stops it. It is kept out of `npm test`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["regtest/**/*.regtest.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
