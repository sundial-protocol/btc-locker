#!/usr/bin/env node
/**
 * Write each package's version into its `src/version.ts`, for the packages
 * that have one. Run after `changeset version` (the root `version` script
 * does), so the version a package reports is the one it is published as.
 * Each package's tests check the two still match.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const packagesDir = new URL("../packages/", import.meta.url);

for (const name of readdirSync(packagesDir)) {
  const dir = new URL(`${name}/`, packagesDir);
  const target = new URL("src/version.ts", dir);
  if (!existsSync(target)) continue;
  const { version } = JSON.parse(readFileSync(new URL("package.json", dir), "utf8"));
  writeFileSync(
    target,
    "// Written by scripts/sync-versions.mjs from package.json. Do not edit.\n" +
      `export const VERSION = "${version}";\n`,
  );
  console.log(`${join("packages", name, "src", "version.ts")}: ${version}`);
}
