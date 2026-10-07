#!/usr/bin/env bash
# Regenerate ../ord-runestones.json from ord's `ordinals` crate (the oracle).
# Needs Rust >= 1.89. The ord commit is pinned in Cargo.toml and Cargo.lock.
set -euo pipefail
cd "$(dirname "$0")"
# Build outside the repo by default: under WSL a target dir on /mnt/c is slow.
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/solstice-ord-oracle/target}"
cargo run --locked --quiet > ../ord-runestones.json.tmp
mv ../ord-runestones.json.tmp ../ord-runestones.json
echo "wrote $(cd .. && pwd)/ord-runestones.json"
