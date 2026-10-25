#!/usr/bin/env bash
# Fetches pinned dependencies into lib/ (kept out of git).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p lib
[ -d lib/forge-std ] || git clone -q --depth 1 --branch v1.17.0 https://github.com/foundry-rs/forge-std.git lib/forge-std
if [ ! -d lib/v4-periphery ]; then
  git clone -q https://github.com/Uniswap/v4-periphery.git lib/v4-periphery
  git -C lib/v4-periphery checkout -q 0c4e5bd3715ce2e72fd7609a1e2835f8300baf7b
  git -C lib/v4-periphery submodule update -q --init --depth 1 lib/v4-core
  git -C lib/v4-periphery/lib/v4-core submodule update -q --init --depth 1 lib/solmate lib/forge-std
fi
echo "dependencies ready"
