#!/usr/bin/env bash
# Phase 6 release build: a repeatable production build from a clean checkout of a committed ref.
# Usage: scripts/release-build.sh [ref=HEAD] [out-dir=release/<version>]
# Builds with the production host list and tool origin (HOST_ORIGINS / TOOL_ORIGIN unset, ADR-0014),
# runs the release licence + header + dist gates, and writes SHA256SUMS for every shipped file.
# Nothing is uploaded: deploying is phase 7.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
REF=${1:-HEAD}
SHA=$(git -C "$ROOT" rev-parse --verify "$REF^{commit}")
VERSION=$(git -C "$ROOT" show "$SHA:package.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).version))')
OUT=${2:-$ROOT/release/$VERSION}
unset HOST_ORIGINS TOOL_ORIGIN
WORK=$(mktemp -d "${TMPDIR:-/tmp}/clip-maker-release.XXXXXX")
cleanup() { git -C "$ROOT" worktree remove --force "$WORK/src" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
git -C "$ROOT" worktree add --detach "$WORK/src" "$SHA" >/dev/null
cd "$WORK/src"
export CI=1
pnpm install --frozen-lockfile --offline
pnpm build
pnpm check:release
rm -rf "$OUT" && mkdir -p "$OUT"
cp -R dist/. "$OUT/"
(cd "$OUT" && find . -type f ! -name SHA256SUMS | LC_ALL=C sort | xargs shasum -a 256 > SHA256SUMS)
echo "release-build: $VERSION from $SHA -> $OUT ($(wc -l < "$OUT/SHA256SUMS" | tr -d ' ') files)"
