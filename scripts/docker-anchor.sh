#!/usr/bin/env bash
# Compila y prueba el programa dentro de Docker (sin instalar Rust/Solana/Anchor).
# Uso: bash scripts/docker-anchor.sh [build|test]   (por defecto: test)
set -euo pipefail
MODO="${1:-test}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
[ "$(uname -o 2>/dev/null)" = "Msys" ] && RAIZ="$(cd "$RAIZ" && pwd -W)" && export MSYS_NO_PATHCONV=1
mkdir -p "$RAIZ/target/idl" "$RAIZ/target/types" "$RAIZ/target/deploy"
docker run --rm -v "$RAIZ:/src:ro" -v "$RAIZ/target:/out" solanafoundation/anchor:v0.32.1 bash -c '
set -e
mkdir /work && cd /src && tar --exclude=node_modules --exclude=app --exclude=target -cf - . | tar -xf - -C /work
mkdir -p /work/target/deploy && cp /src/target/deploy/*.json /work/target/deploy/ 2>/dev/null || true
cd /work
npm install --no-audit --no-fund >/dev/null 2>&1
solana-keygen new --no-bip39-passphrase -s -o ~/.config/solana/id.json >/dev/null
if [ "'"$MODO"'" = "build" ]; then anchor build; else anchor test; fi
cp -r target/idl target/types /out/ 2>/dev/null || true
cp target/deploy/*.so /out/deploy/ 2>/dev/null || true
'
