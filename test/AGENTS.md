# Agents Guide — shared spec fixtures

This directory holds two kinds of shared, cross-runtime test data:

- `spec/*.tsv` — the input → output conformance fixtures described below.
- `known-lenient.json` — the RFC 8259 leniency pin for the vendored
  `JSONTestSuite/` corpus, read by ALL of `ts/test/jsontestsuite.test.ts`,
  `go/jsontestsuite_test.go` and `rs/tests/jsontestsuite_test.rs`. It is **not** a skip list: it records, with one
  written reason per entry, every case where jsonc deliberately diverges from
  strict RFC 8259, and it is pinned exactly so a lenience cannot be gained or
  lost unnoticed. Change an entry only together with the behaviour change that
  justifies it; never re-pin to silence a red run.

`spec/*.tsv` holds the cross-runtime conformance fixtures. All three
runtimes auto-discover and run **every** file in this directory, so a
change here affects TypeScript, Go and Rust together — edit with that in
mind.

## Format

Tab-separated, one case per line, with a header row naming the columns.
Blank lines are skipped, and so are comment lines — a line starting with
`#` that contains no tab. (A data row always has at least one tab, so a
`#`-leading source such as a C preprocessor directive still works.)

| Column | Meaning |
|---|---|
| `input` | JSONC source. Escapes `\n` `\r` `\t` `\\` `\0` are decoded (`\0` because JSONC must reject an unprintable NUL). |
| `expected` | A JSON value (the parse result), or `ERROR` / `ERROR:<code>` for inputs that must fail. The code is compared **exactly** — it is the error's code, not a substring of its message. Trivia-only input yields no value at all, spelled with the bare token `UNDEFINED`. |
| `opts` | Optional JSON object of plugin options (empty means defaults). |

`expected` and `opts` are **not** escape-decoded — they are raw JSON, so
JSON's own escape rules apply (`"a\nb"` is a string containing a newline).
To put a literal backslash in `input`, write `\\`.

Results are compared after a JSON round-trip, so key order and the
`OrderedMap` / null-prototype-object representations do not affect the
comparison.

## Who runs what

- TypeScript: `ts/test/parity.test.ts` — `makeRunner(...).dir(...)`.
- Go: `go/parity_test.go` — `support.Runner{...}.Dir(t, dir)`.
- Rust: `rs/tests/parity_test.rs` — `Runner::new_with_row(...).dir(dir)`
  from `tabnas_support`, the shared loader's Rust half: a fresh parser
  per row from the `opts` cell, the same jsonc escape codec, and the
  `UNDEFINED` cell read as `null` (the Rust engine folds a top-level
  undefined into null, as Go's `nil` does; see `DIVERGENCE.md`).

Each is a dozen lines holding only what is specific to jsonc: how to
build the parser for a row's options. Everything else — finding
`test/spec`, reading the file, decoding escapes, the `ERROR:` contract,
the comparison, the `<file>:<line>` in a failure message — comes from
[`@tabnas/support`](https://github.com/tabnas/support) and its Go half, so
the two loaders cannot drift from each other either.

All three discover files by directory listing: adding a `.tsv` here runs
it in every runtime without touching any runner. An empty fixture, and a spec
directory with no fixtures in it, both **fail** — a runner that reports
green having run nothing is indistinguishable from coverage that was never
there.

## Rules

- Prefer adding a fixture here over a one-off in-language assertion when a
  case is expressible as input → output. That is what keeps the three
  runtimes honest against each other.
- Write a rejection row as `ERROR:<code>`, never as a bare `ERROR`. No
  fixture here carries a bare cell any more: a bare `ERROR` asserts only
  that the document is refused, so a runtime could start raising a
  different code and stay green, and two runtimes that reject the same
  input with different codes have agreed on nothing.
- TypeScript is canonical. If the runtimes disagree, the TS behaviour is
  the expected value — unless Go has exposed a genuine TS defect, in which
  case fix TS first and pin the corrected behaviour here.
- A new fixture must pass in ALL THREE runtimes: run `go test ./...` (from
  `go/`), `npm test` (from `ts/`) and `cargo test --all-targets` (from
  `rs/`) before considering it done.
