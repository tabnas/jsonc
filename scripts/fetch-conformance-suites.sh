#!/usr/bin/env bash
#
# fetch-conformance-suites.sh — fetch the third-party conformance corpora this
# repo measures itself against, and derive the JSONC corpus from them.
#
# NOTHING THIS SCRIPT DOWNLOADS IS EVER COMMITTED. Third-party test corpora are
# fetched at a PINNED COMMIT SHA into test/vendor/, which .gitignore excludes.
# Only this script, the generator it calls, and the pinned SHAs below are
# tracked. (Licensing is part of the reason: nst/JSONTestSuite and
# microsoft/node-jsonc-parser are separately licensed works.)
#
# Idempotent: re-running is safe and cheap. Pass --force to refetch.
#
# Usage:
#   scripts/fetch-conformance-suites.sh [--force]
#
# Produces (all gitignored):
#   test/vendor/JSONTestSuite/test_parsing/*.json   RFC 8259 corpus, 318 files
#   test/vendor/node-jsonc-parser/src/...           reference impl + its tests
#   test/vendor/node-jsonc-parser/lib/main.js       reference impl, compiled
#   test/vendor/corpus.json                         derived JSONC corpus
#
set -euo pipefail

# --- pinned upstreams ----------------------------------------------------
#
# nst/JSONTestSuite — the canonical RFC 8259 parsing corpus ("Parsing JSON is a
# Minefield"). There is no tagged release; this SHA is master as of 2026-08-07.
JTS_REPO='https://github.com/nst/JSONTestSuite'
JTS_SHA='1ef36fa01286573e846ac449e8683f8833c5b26a'

# microsoft/node-jsonc-parser — the de-facto normative JSONC implementation
# (the parser VS Code itself uses). JSONC has no ISO/IETF spec and no
# standalone conformance corpus, so this repo IS the authority: its own
# src/test/json.test.ts supplies hand-written cases, and the compiled
# implementation acts as the reference oracle for everything else.
NJP_REPO='https://github.com/microsoft/node-jsonc-parser'
NJP_SHA='3c9b4203d663061d87d4d34dd0004690aef94db5'   # tag v3.3.1

# -------------------------------------------------------------------------
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$HERE/test/vendor"
FORCE=0
[ "${1:-}" = '--force' ] && FORCE=1

mkdir -p "$VENDOR"

fetch() { # fetch <destdir> <repo-url> <sha>
  local dest="$1" repo="$2" sha="$3"
  local stamp="$dest/.pinned-sha"
  if [ "$FORCE" = 0 ] && [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$sha" ]; then
    echo "fetch: $(basename "$dest") already at $sha"
    return 0
  fi
  echo "fetch: $(basename "$dest") <- $repo @ $sha"
  rm -rf "$dest" "$dest.tmp"
  mkdir -p "$dest.tmp"
  # codeload serves a tarball for any commit-ish; a SHA pins it exactly.
  curl -fsSL "${repo/github.com/codeload.github.com}/tar.gz/$sha" \
    | tar xz -C "$dest.tmp" --strip-components=1
  mv "$dest.tmp" "$dest"
  echo "$sha" > "$stamp"
}

fetch "$VENDOR/JSONTestSuite"      "$JTS_REPO" "$JTS_SHA"
fetch "$VENDOR/node-jsonc-parser"  "$NJP_REPO" "$NJP_SHA"

# --- verify the fetch actually landed ------------------------------------
n_jts="$(find "$VENDOR/JSONTestSuite/test_parsing" -name '*.json' | wc -l)"
if [ "$n_jts" -lt 300 ]; then
  echo "fetch: FAILED — expected >=300 JSONTestSuite files, found $n_jts" >&2
  exit 1
fi
[ -f "$VENDOR/node-jsonc-parser/src/test/json.test.ts" ] || {
  echo "fetch: FAILED — node-jsonc-parser src/test/json.test.ts missing" >&2
  exit 1
}

# --- compile the reference oracle ----------------------------------------
#
# node-jsonc-parser has NO runtime dependencies, so its TypeScript sources
# compile standalone with this repo's own tsc. Compiling from the pinned SHA
# (rather than npm-installing `jsonc-parser`) keeps the oracle pinned to a
# commit, not to a mutable registry tag.
TSC="$HERE/ts/node_modules/.bin/tsc"
if [ ! -x "$TSC" ]; then
  echo "fetch: FAILED — $TSC not found; run 'npm install' in ts/ first" >&2
  exit 1
fi
if [ "$FORCE" = 1 ] || [ ! -f "$VENDOR/node-jsonc-parser/lib/main.js" ]; then
  echo "fetch: compiling reference oracle (jsonc-parser@v3.3.1 from source)"
  # tsc exits 0 here but prints a deprecation notice for moduleResolution=node;
  # the emit is what matters, and the existence check below is the real gate.
  "$TSC" "$VENDOR/node-jsonc-parser/src/main.ts" \
    --target es2020 --module commonjs --moduleResolution node \
    --lib es2020 --strict --skipLibCheck --preserveConstEnums \
    --outDir "$VENDOR/node-jsonc-parser/lib" >/dev/null 2>&1 || true
fi
[ -f "$VENDOR/node-jsonc-parser/lib/main.js" ] || {
  echo "fetch: FAILED — reference oracle did not compile" >&2
  exit 1
}

# --- derive the corpus ---------------------------------------------------
node "$HERE/scripts/gen-corpus.mjs"

echo "fetch: OK"
