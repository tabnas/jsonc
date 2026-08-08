#!/bin/sh
# Fetch the pinned upstream sources that the JSONC conformance fixtures are
# DERIVED from, into test/vendor/. Nothing in the test suite reads test/vendor/
# at run time — it is a working area for re-deriving fixtures, and it is
# .gitignore'd (two full upstream checkouts, ~170MB).
#
# Do not confuse it with test/JSONTestSuite/, which IS vendored in this
# repository (with its upstream LICENSE) and is what
# ts/test/jsontestsuite.test.ts actually runs. That test fails, rather than
# skips, if its corpus is missing — so `make test` never depends on this
# script.
#
# Fetch it when you need to re-derive or re-audit:
#   - the microsoft/node-jsonc-parser cases mirrored in ts/test/jsonc.test.ts
#     and go/jsonc_test.go,
#   - the shared cross-runtime fixtures in test/spec/*.tsv.
#
# Both checkouts are pinned to the exact commits the current fixtures were
# derived from, so a re-derivation is reproducible.
#
#   sh test/fetch-conformance-suites.sh

set -e

VENDOR="$(cd "$(dirname "$0")" && pwd)/vendor"

# Pinned upstreams. Bump a SHA only together with a re-derivation of the
# fixtures it feeds, never on its own.
JSONC_PARSER_REPO="https://github.com/microsoft/node-jsonc-parser.git"
JSONC_PARSER_SHA="3c9b4203d663061d87d4d34dd0004690aef94db5" # v3.3.1
JSON_TEST_SUITE_REPO="https://github.com/nst/JSONTestSuite.git"
JSON_TEST_SUITE_SHA="1ef36fa01286573e846ac449e8683f8833c5b26a"

fetch() {
  name="$1"
  repo="$2"
  sha="$3"
  dir="$VENDOR/$name"

  if [ -f "$dir/.pinned-sha" ] && [ "$(cat "$dir/.pinned-sha")" = "$sha" ]; then
    echo "$name already at $sha"
    return 0
  fi

  echo "Fetching $name at $sha ..."
  rm -rf "$dir"
  mkdir -p "$dir"
  git -C "$dir" init -q
  git -C "$dir" remote add origin "$repo"
  git -C "$dir" fetch -q --depth 1 origin "$sha"
  git -C "$dir" checkout -q FETCH_HEAD
  # Drop the checkout's own .git: a nested repository under a tracked path
  # turns any `git add` into a mode-160000 gitlink, which ships an empty
  # directory to everyone who clones this repo.
  rm -rf "$dir/.git"
  printf '%s\n' "$sha" >"$dir/.pinned-sha"
  echo "Done: $name"
}

mkdir -p "$VENDOR"
fetch node-jsonc-parser "$JSONC_PARSER_REPO" "$JSONC_PARSER_SHA"
fetch JSONTestSuite "$JSON_TEST_SUITE_REPO" "$JSON_TEST_SUITE_SHA"

echo "Upstream sources in $VENDOR (gitignored)."
