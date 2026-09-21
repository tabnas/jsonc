# Agents Guide: rs/

The Rust port of the canonical TypeScript in [`../ts`](../ts). Read
[`../AGENTS.md`](../AGENTS.md) first: it holds the cross-runtime rules,
and this file only covers what is specific to this crate.

## Layout

| Path | |
|---|---|
| `src/lib.rs` | the whole port: the embedded grammar text, `JsoncOptions`, `DEPTH_LIMIT` and the budget check, `jsonc`, `plugin`, `make`, `make_with`, `parse` |
| `tests/parity_test.rs` | every `../test/spec/*.tsv` fixture through `tabnas_support::Runner::new_with_row`, a fresh parser per row from the `opts` column |
| `tests/jsontestsuite_test.rs` | the vendored RFC 8259 corpus in all three option modes against `../test/known-lenient.json`; fails, never skips |
| `tests/jsonc_test.rs` | the port of `go/jsonc_test.go` (which mirrors `ts/test/jsonc.test.ts`), plus what a fixture cannot say: group tags, option round-trips, layering, derive, the nesting boundary, the embed against the file on disk, threads |
| `tests/perf_test.rs` | instance reuse beats rebuild-per-parse, mirroring `go/perf_test.go` |
| `tests/version_test.rs` | Cargo.toml == `VERSION` == ts/package.json |
| `tests/common/mod.rs` | shared helpers: spec dir, value and failure conversion, the jsonc escape codec, the options cell reader |
| `README.md` | the crate front page, prose-gated; its `rust` fences are doctests of this crate (see below) |

Crate `tabnas-jsonc`, library `tabnas_jsonc`. The engine (`tabnas`),
the jsonic grammar (`tabnas-jsonic`, which itself takes `tabnas-json`)
and the fixture runner (`tabnas-support`, dev only) are **path
dependencies on sibling checkouts** (`../../parser/rs`,
`../../jsonic/rs`, `../../json/rs`, `../../support/rs`). None is
published, so there is no registry version to fall back on.

```bash
cargo build --all-targets
cargo test --all-targets && cargo test --doc
cargo clippy --all-targets --all-features -- -D warnings
cargo fmt
```

`make test-rs` from the repository root is the fast loop; `ci/rust/run.sh`
is the full gate and adds `fmt --check`, the lockfile check and the MSRV
pin.

## The grammar is jsonic text, parsed at install time

Unlike chess and css, whose embed step converts the grammar to JSON,
`jsonc-grammar.jsonic` is embedded VERBATIM in all three runtimes and
parsed by a jsonic instance when the plugin installs: `new
Tabnas().use(jsonic).parse(grammarText)` in TypeScript, `GrammarText` in
Go, `tabnas_jsonic::parse(GRAMMAR_TEXT)` here. The parsed document is
converted once and cached in a `OnceLock`.

Two conversions sit between the parse and `GrammarSpec::from_value`,
and both exist because the other runtimes never meet the question:

- `integers` puts whole-valued numbers back as integers. jsonic's value
  model has one number type, so the `b: 1` backtrack count parses as
  `1.0`, and the engine's document reader refuses a float where it
  wants a count.
- `resolve_number_exclude` unwraps `number.exclude` from the shared
  `@/^\./` reference form to the bare `^\.` pattern. The TypeScript and
  Go engines resolve that form wherever it appears in an option
  document; the Rust engine takes `number.exclude` as the pattern
  itself. Without this the pattern never matches and `.0` is accepted;
  `number_exclude_is_installed_as_a_bare_pattern` pins it.

`ts/embed-grammar.js` writes the raw string between the BEGIN/END
markers in `src/lib.rs` as well as the TypeScript and Go embeds (it
skips a runtime whose source file is absent). Never hand-edit between
the markers: `embedded_grammar_matches_the_file_on_disk` compares the
text against the file at the repository root and
`embedded_grammar_matches_the_go_embed` against `go/jsonc.go`.

## Install order in `jsonc`

1. Refuse an engine with no `val` rule: the alternates extend jsonic's
   rules, and there is nothing to extend on a bare instance.
2. `grammar_with_setting(.., GrammarSetting::groups("jsonc"))`: the
   static options and the three alternates, every one tagged `jsonc`.
3. `set_options` for the argument-dependent options: `comment.lex` from
   `disallow_comments`, `rule.include = "jsonc,json"`, and
   `rule.exclude = "comma"` unless `allow_trailing_comma`.
4. `parse_budget(1, within_depth_limit)`, LAST, because an options pass
   that does not mention `parse.budget` need not preserve one.

Same order as the TypeScript and Go plugins for steps 2 and 3; the
budget is this port's own (below).

## The nesting limit is a divergence, and why it exists

The Rust engine's cost per iteration grows with the height of its rule
stack, so a parse costs time quadratic in the nesting depth. Measured
in a debug build on this crate, at depths the shipped limit still lets
you reproduce: closed arrays 100 deep take 0.07 s, 200 deep 0.30 s, 400
deep 1.02 s, 500 deep 1.61 s, a fourfold cost for each doubling; flat
input scales linearly. Extrapolate that curve and the RFC corpus's
`n_structure_100000_opening_arrays` (100,000 levels) and
`n_structure_open_array_object` (50,000) would take hours each, which is
what left the corpus test spinning before the limit existed.

Time is only half of it. `Value::to_json` recurses once per level, and
so does dropping the `serde_json::Value` it builds. Measured in a debug
build, that costs about 2.2 KiB of stack per level, so a thread with
the standard library's default 2 MiB stack aborts between 920 and 950
levels. A limit of 1,000 would therefore be reachable as a process
abort: parse a 1,000-level document on a worker thread, call `to_json`
on the result, and the runtime kills the process, which no caller can
catch.

So `jsonc` sets a parse budget that cancels at `DEPTH_LIMIT` (512)
containers, counted from the rule names the way `tabnas_json` counts
its own limit. The band is narrow and both walls are measured: the
floor is 500, because `test/known-lenient.json` pins
`i_structure_500_nested_arrays` as ACCEPTED in every mode and the
corpus test would otherwise go red on the `i_*` set; the ceiling is the
2 MiB stack above. It is recorded in `../DIVERGENCE.md`;
`nesting_deeper_than_the_limit_is_cancelled` measures the parse
boundary from every construction path, and
`a_limit_deep_value_walks_on_a_default_thread_stack` measures the other
wall by doing the walk on a 2 MiB thread. Do not remove the limit to
"match TypeScript" and do not raise it: the repair belongs in the
engine, and until then the corpus test cannot finish and the stack
cannot be trusted without it.

## A trivia-only document is `Null`

The engine folds a top-level `Undefined` into `Value::Null` at the end
of every parse (`Value::unwrap_undefined`), so `parse("// c")` is `Null`
here where TypeScript returns `undefined`. The fixtures spell the case
`UNDEFINED`; `parity_test.rs` reads that cell as `null`, as the Go
runner reads it as `nil`. Recorded in `../DIVERGENCE.md`. A doctest
that asserts `is_undefined()` on such a parse fails.

`trivia` in `jsonc_test.rs` compares the flattened JSON and so cannot
see this case at all; `a_trivia_only_document_is_null_and_not_undefined`
compares the `Value` and is what pins it.

## The fixture runner

Every fixture carries the same `input`, `expected`, `opts` header, so
there are no bespoke shapes and no exemptions;
`every_fixture_has_the_shared_shape` asserts the header on each file
and a floor of twelve files. Per row: the `opts` cell is parsed as JSON
into `JsoncOptions` (an empty cell is the defaults; a cell that is not
JSON comes back as a VALUE, so a bare `ERROR` row cannot be satisfied
by a broken harness), a FRESH parser is built through `make_with`, and
the result goes through `to_json` (the Go runner's flattening).

The input cell is decoded by this crate's own `unescape_jsonc`, not the
shared codec, because jsonc's fixtures need `\0` decoded to NUL (a raw
NUL in a string must be rejected as `unprintable`, and cannot be
written literally in a .tsv). It is kept byte-identical to
`unescapeJsonc` in `ts/test/parity.test.ts` and `specUnescape` in
`go/parity_test.go`.

## The corpus test never skips

`jsontestsuite_test.rs` reads the corpus vendored at
`../test/JSONTestSuite/test_parsing` and panics, with the reason, when
it is missing. The pin is read from the same `known-lenient.json` the
other runtimes read, and asserted exactly: a lenience gained or lost
fails. Files are read with `from_utf8_lossy`, which is the decoding
Node applies, so the invalid-UTF-8 cases reach the parser as the same
text they reach the canonical runtime as. With the budget in place the
three modes take a few seconds each in a debug build; most of that is
the pinned 500-level case and the two cancelled deep cases.

## The docs are gated

`README.md` is in the published set: no em dashes in prose, no first
person singular, no links to any `AGENTS.md`, no project history. This
file is internal and may be blunt.

## The README is doctested

`src/lib.rs` includes `README.md` as rustdoc under `#[cfg(doctest)]`, so
every `rust` fence in it runs on `cargo test --doc` (they show up as
`readme_examples (line N)`). rustdoc runs each fence as written, so a
fence must be a complete program: wrap it in
`fn main() -> Result<(), Box<dyn std::error::Error>> { ... Ok(()) }`
rather than using `?` at the top level, and never use hidden `# ` lines,
which render as garbage on GitHub. The `toml` and `bash` fences are not
run.
