#!/usr/bin/env bash
# Build the Chrome Web Store upload: dist/release-radar-<version>.zip with only the files the extension loads.
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
node --test tests/
mkdir -p dist
out="dist/release-radar-$version.zip"
rm -f "$out"
zip -qr "$out" manifest.json icons src popup options -x '*.DS_Store'
echo "$out"
unzip -l "$out" | tail -1
