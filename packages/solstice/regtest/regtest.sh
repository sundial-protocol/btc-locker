#!/usr/bin/env bash
# Bitcoin Core regtest + ord (runes index) for the Solstice regtest suite.
#
#   regtest.sh run     start both, run `npm run test:regtest`, stop both
#   regtest.sh up      download (first time), start bitcoind and ord
#   regtest.sh down    stop both and delete the chain and the index
#   regtest.sh status  show what is running
#   regtest.sh logs    print the tail of both logs
#
# Runs on Linux x86_64 and macOS. On Windows run it inside WSL: the daemons run
# in WSL and the test suite reaches them on localhost, with either a Linux node
# or the Windows one (run `npm run test:regtest` from Windows, or let `run` find
# npm through cmd.exe).
#
# Binaries are official release archives, checked against the SHA-256 values
# below, kept in $SOLSTICE_REGTEST_HOME (default ~/.cache/solstice-regtest).
# Every `up` starts from an empty chain.
set -euo pipefail

BITCOIN_VERSION=29.0
ORD_VERSION=0.29.0 # commit 7e37a3bd, the same one tests/vectors/ord-oracle pins

HOME_DIR="${SOLSTICE_REGTEST_HOME:-${XDG_CACHE_HOME:-$HOME/.cache}/solstice-regtest}"
BIN_DIR="$HOME_DIR/bin"
DATA_DIR="$HOME_DIR/data"
RPC_PORT="${SOLSTICE_REGTEST_RPC_PORT:-18543}"
ORD_PORT="${SOLSTICE_REGTEST_ORD_PORT:-18580}"
# Regtest only. The suite reads the same defaults (regtest/env.ts).
RPC_USER=solstice
RPC_PASS=solstice

PACKAGE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

die() { echo "regtest.sh: $*" >&2; exit 1; }

sha256_of() {
  if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

# fetch <url> <sha256> <destination file>
fetch() {
  local url=$1 want=$2 dest=$3 got
  if [ ! -f "$dest" ]; then
    echo "downloading $url"
    curl --fail --location --silent --show-error --output "$dest.part" "$url"
    mv "$dest.part" "$dest"
  fi
  got=$(sha256_of "$dest")
  [ "$got" = "$want" ] || { rm -f "$dest"; die "checksum mismatch for $url: got $got, want $want"; }
}

install_binaries() {
  local os arch bitcoin_target bitcoin_sha ord_target ord_sha
  os=$(uname -s) arch=$(uname -m)
  case "$os-$arch" in
    Linux-x86_64)
      bitcoin_target=x86_64-linux-gnu
      bitcoin_sha=a681e4f6ce524c338a105f214613605bac6c33d58c31dc5135bbc02bc458bb6c
      ord_target=x86_64-unknown-linux-gnu
      ord_sha=f65c758d71549954470aa7fe23b197478688fb4f910e84c2956cf9144078a94e ;;
    Darwin-arm64)
      bitcoin_target=arm64-apple-darwin
      bitcoin_sha=34431c582a0399dd42e1276d87d25306cbdde0217f6744bd55a2945986645dda
      ord_target=aarch64-apple-darwin
      ord_sha=9360e97054a1d96624190634882c187126b02647a889b344cb601627ed1bd80c ;;
    Darwin-x86_64)
      bitcoin_target=x86_64-apple-darwin
      bitcoin_sha=5bb824fc86a15318d6a83a1b821ff4cd4b3d3d0e1ec3d162b805ccf7cae6fca8
      ord_target=x86_64-apple-darwin
      ord_sha=a0085f296057563a31258402437c1182fc13bb9559826d1f5490feb4be6dbb75 ;;
    *) die "no pinned binaries for $os $arch; put bitcoind $BITCOIN_VERSION and ord $ORD_VERSION in $BIN_DIR yourself" ;;
  esac

  mkdir -p "$BIN_DIR" "$HOME_DIR/downloads"

  if [ ! -x "$BIN_DIR/bitcoind" ]; then
    local archive="$HOME_DIR/downloads/bitcoin-$BITCOIN_VERSION-$bitcoin_target.tar.gz"
    fetch "https://bitcoincore.org/bin/bitcoin-core-$BITCOIN_VERSION/bitcoin-$BITCOIN_VERSION-$bitcoin_target.tar.gz" "$bitcoin_sha" "$archive"
    tar -xzf "$archive" -C "$HOME_DIR/downloads"
    cp "$HOME_DIR/downloads/bitcoin-$BITCOIN_VERSION/bin/bitcoind" "$HOME_DIR/downloads/bitcoin-$BITCOIN_VERSION/bin/bitcoin-cli" "$BIN_DIR/"
  fi

  if [ ! -x "$BIN_DIR/ord" ]; then
    local archive="$HOME_DIR/downloads/ord-$ORD_VERSION-$ord_target.tar.gz"
    fetch "https://github.com/ordinals/ord/releases/download/$ORD_VERSION/ord-$ORD_VERSION-$ord_target.tar.gz" "$ord_sha" "$archive"
    mkdir -p "$HOME_DIR/downloads/ord-$ORD_VERSION"
    tar -xzf "$archive" -C "$HOME_DIR/downloads/ord-$ORD_VERSION"
    cp "$(find "$HOME_DIR/downloads/ord-$ORD_VERSION" -type f -name ord | head -n 1)" "$BIN_DIR/ord"
  fi

  if ! "$BIN_DIR/ord" --version >/dev/null 2>&1; then
    # The release binary links OpenSSL 3 (Ubuntu 22.04 and later). On older
    # systems build the same tag from source; needs Rust >= 1.89 and libssl-dev.
    echo "ord release binary does not run here, building ord $ORD_VERSION from source (several minutes)"
    command -v cargo >/dev/null || die "ord release binary does not run and cargo is not installed"
    cargo install --locked --git https://github.com/ordinals/ord --tag "$ORD_VERSION" --root "$HOME_DIR/ord-src" ord
    cp "$HOME_DIR/ord-src/bin/ord" "$BIN_DIR/ord"
    "$BIN_DIR/ord" --version >/dev/null || die "ord built from source does not run"
  fi
}

cli() {
  # -datadir keeps bitcoin-cli away from a bitcoin.conf in the default location.
  "$BIN_DIR/bitcoin-cli" -regtest -datadir="$DATA_DIR/bitcoin" -rpcport="$RPC_PORT" -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASS" "$@"
}

# Start a daemon in its own session when possible: ord shuts down on SIGHUP, so
# it must not die with the terminal (or the wsl.exe call) that started it.
DETACH=()
if command -v setsid >/dev/null; then DETACH=(setsid); fi

running() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

stop_pid() {
  if running "$1"; then
    kill "$(cat "$1")" 2>/dev/null || true
    for _ in $(seq 1 50); do running "$1" || break; sleep 0.2; done
    running "$1" && kill -9 "$(cat "$1")" 2>/dev/null || true
  fi
  rm -f "$1"
}

down() {
  stop_pid "$HOME_DIR/ord.pid"
  stop_pid "$HOME_DIR/bitcoind.pid"
  rm -rf "$DATA_DIR"
}

up() {
  install_binaries
  down
  mkdir -p "$DATA_DIR/bitcoin" "$DATA_DIR/ord"

  # -txindex: ord looks up the commit transaction of every etching.
  nohup ${DETACH[@]+"${DETACH[@]}"} "$BIN_DIR/bitcoind" -regtest -datadir="$DATA_DIR/bitcoin" \
    -server -txindex=1 -listen=0 -fallbackfee=0.0001 \
    -rpcbind=127.0.0.1 -rpcallowip=127.0.0.1 -rpcport="$RPC_PORT" \
    -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASS" \
    >"$HOME_DIR/bitcoind.log" 2>&1 &
  echo $! >"$HOME_DIR/bitcoind.pid"

  for _ in $(seq 1 100); do cli getblockcount >/dev/null 2>&1 && break; sleep 0.2; done
  cli getblockcount >/dev/null || { tail -n 20 "$HOME_DIR/bitcoind.log" >&2; die "bitcoind did not start"; }

  nohup ${DETACH[@]+"${DETACH[@]}"} "$BIN_DIR/ord" --regtest --index-runes \
    --bitcoin-rpc-url "127.0.0.1:$RPC_PORT" \
    --bitcoin-rpc-username "$RPC_USER" --bitcoin-rpc-password "$RPC_PASS" \
    --bitcoin-data-dir "$DATA_DIR/bitcoin" --data-dir "$DATA_DIR/ord" \
    server --address 127.0.0.1 --http-port "$ORD_PORT" --polling-interval 500ms \
    >"$HOME_DIR/ord.log" 2>&1 &
  echo $! >"$HOME_DIR/ord.pid"

  for _ in $(seq 1 100); do
    curl --silent --fail "http://127.0.0.1:$ORD_PORT/blockheight" >/dev/null 2>&1 && break
    sleep 0.2
  done
  curl --silent --fail "http://127.0.0.1:$ORD_PORT/blockheight" >/dev/null \
    || { tail -n 20 "$HOME_DIR/ord.log" >&2; die "ord did not start"; }

  echo "bitcoind $("$BIN_DIR/bitcoind" --version | head -n 1 | sed 's/.*version //') rpc 127.0.0.1:$RPC_PORT"
  echo "$("$BIN_DIR/ord" --version) http://127.0.0.1:$ORD_PORT"
}

status() {
  running "$HOME_DIR/bitcoind.pid" && echo "bitcoind: height $(cli getblockcount)" || echo "bitcoind: not running"
  running "$HOME_DIR/ord.pid" && echo "ord: height $(curl --silent "http://127.0.0.1:$ORD_PORT/blockheight")" || echo "ord: not running"
}

run_suite() {
  cd "$PACKAGE_DIR"
  if command -v npm >/dev/null && ! command -v npm | grep -q '^/mnt/'; then
    npm run test:regtest
  elif command -v cmd.exe >/dev/null; then
    # WSL without a Linux node: use the Windows one.
    cmd.exe /c "npm run test:regtest"
  else
    die "npm not found"
  fi
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  status) status ;;
  logs) tail -n 40 "$HOME_DIR/bitcoind.log" "$HOME_DIR/ord.log" ;;
  run)
    up
    trap down EXIT
    run_suite ;;
  *) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
