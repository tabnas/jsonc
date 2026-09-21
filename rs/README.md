# tabnas-jsonc (Rust)

The JSONC (JSON with comments) grammar plugin for the
[`tabnas`](https://github.com/tabnas/parser) parsing engine, crate
`tabnas_jsonc`.

JSONC is the dialect of editor and tool configuration files such as
`tsconfig.json` and `settings.json`: standard JSON plus single-line
(`//`) and block (`/* */`) comments, with optional trailing commas in
objects and arrays. The plugin layers on the relaxed-JSON grammar of
[`tabnas-jsonic`](https://github.com/tabnas/jsonic) and adds no rules of
its own: it installs an end-of-input alternate, the trailing-comma
alternates, and pulls the lexer, number, string and map options back
toward standard JSON.

This is the Rust port of the canonical TypeScript implementation in
[`../ts`](../ts); the TypeScript version is authoritative and this crate
tracks it. The Go port is in [`../go`](../go). The grammar itself is
authored once, in [`../jsonc-grammar.jsonic`](../jsonc-grammar.jsonic),
and embedded into all three runtimes by `ts/embed-grammar.js`.

## Use

```rust
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let value = tabnas_jsonc::parse(r#"{ "foo": /* hello */ true }"#)?;
    assert_eq!(value.to_string(), r#"{"foo":true}"#);
    Ok(())
}
```

The two plugin options are a typed struct. `allow_trailing_comma`
accepts a comma before a closing bracket, and `disallow_comments`
turns the plugin into a strict JSON parser:

```rust
fn main() -> Result<(), Box<dyn std::error::Error>> {
    use tabnas_jsonc::JsoncOptions;

    let lenient = tabnas_jsonc::make_with(JsoncOptions::new().with_allow_trailing_comma(true));
    assert_eq!(lenient.parse(r#"{ "a": [1, 2,], }"#)?.to_string(), r#"{"a":[1,2]}"#);

    let strict = tabnas_jsonc::make_with(JsoncOptions::new().with_disallow_comments(true));
    assert_eq!(strict.parse("[1] // no comments").unwrap_err().code, "unexpected");

    let plain = tabnas_jsonc::make();
    assert_eq!(plain.parse("[1, 2,]").unwrap_err().code, "unexpected");
    Ok(())
}
```

To layer the plugin on an instance of your own, install it through
`use_plugin`, the `tn.use(jsonic).use(Jsonc, options)` of the TypeScript
package, with the option bag under the TypeScript key names; or call
`jsonc` directly on an engine that already carries the jsonic grammar:

```rust
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut parser = tabnas_jsonic::make();
    let options = tabnas_jsonc::JsoncOptions::new().with_allow_trailing_comma(true);
    parser.use_plugin(tabnas_jsonc::plugin(), Some(options.to_value()))?;
    assert_eq!(parser.parse("[1, /* two */ 2,]")?.to_string(), "[1,2]");

    let mut by_hand = tabnas::Tabnas::new();
    tabnas_jsonic::jsonic(&mut by_hand)?;
    tabnas_jsonc::jsonc(&mut by_hand, &tabnas_jsonc::JsoncOptions::new())?;
    assert_eq!(by_hand.parse(r#"{ "a": 1 } // done"#)?.to_string(), r#"{"a":1}"#);
    Ok(())
}
```

Parse errors are the engine's `TabnasError`, re-exported as
`JsoncError`, with `code`, `row`, `col` and a report that shows the
offending source with a caret. The plugin declares no codes of its own;
the ones a JSONC document meets are `unexpected`, `unprintable`,
`unterminated_comment`, `unterminated_string` and `end_of_source`.

## Install

Neither the engine nor the grammars it builds on are published to a
registry, so all of them are consumed as **sibling checkouts**, the
standard tabnas development model. Clone
`https://github.com/tabnas/parser`, `https://github.com/tabnas/jsonic`
and `https://github.com/tabnas/json` (jsonic takes json the same way)
next to this repository and point at them:

```toml
[dependencies]
tabnas-jsonc = { path = "../jsonc/rs" }
tabnas-jsonic = { path = "../jsonic/rs" }
tabnas = { path = "../parser/rs" }
```

All three entries are needed. A crate's dependencies are not passed on
to its dependents, so `tabnas-jsonc` alone does not put `tabnas` or
`tabnas-jsonic` in your extern prelude, and the examples above that name
`tabnas::Tabnas` and `tabnas_jsonic::make` would not resolve. Only
`JsoncError` is re-exported. The test suite additionally needs
`https://github.com/tabnas/support` beside the repository, for the
shared fixture runner.

## Differences from the canonical TypeScript

Within the two limits recorded in [`../DIVERGENCE.md`](../DIVERGENCE.md)
and listed first below, every document the TypeScript plugin accepts or
rejects, this crate accepts or rejects with the same error code, and the
shared fixtures in [`../test/spec`](../test/spec) and the RFC 8259
corpus in [`../test/JSONTestSuite`](../test/JSONTestSuite) hold all
three runtimes to that. What differs is the shape of the API and those
two points:

- **Nesting is bounded.** Objects and arrays may nest `DEPTH_LIMIT`
  (1,000) levels; the next level is rejected with the `cancel` code.
  The TypeScript plugin sets no limit. The Rust engine's cost grows
  with the square of the nesting depth, so the limit is what keeps a
  hostile document from running for hours, and it stands well above
  the 500 levels the conformance pin requires to be accepted.
- **A trivia-only document is `null`.** Whitespace and comments alone
  have no value, which TypeScript returns as `undefined`. The Rust
  engine folds a top-level undefined into `Value::Null` at the end of
  every parse, so `parse("// only")` is `Null` here, as it is `nil` in
  Go. The fixtures spell the case `UNDEFINED`, and the Rust runner reads
  that cell as `null`, exactly as the Go runner does.
- **Options are a struct, not an object.** `JsoncOptions` carries the
  two switches with builder methods; `to_value` and `from_value` move
  them through the engine's plugin option bag under the TypeScript key
  names (`allowTrailingComma`, `disallowComments`) for `use_plugin`.
- **`parse` is a convenience the other runtimes lack.** The TypeScript
  package and the Go module are installed on an instance the caller
  builds; this crate also offers `parse` over one shared default
  instance, built on first use.
- **Key order is document order.** Inherited from `tabnas-jsonic`: an
  `IndexMap` keeps every key where it arrived.
- **Lone surrogates fold to U+FFFD**, and the regular expression
  dialect is the `regex` crate's. Both come from the engine, and both
  are recorded there.

## Build and test

The engine, the grammars and the fixture runner are path dependencies
on sibling checkouts, so there is nothing to fetch:

```bash
cargo test --all-targets && cargo test --doc
```

Or, from the repository root, `make test-rs`. For what CI would say,
including formatting and the lockfile check, run `ci/rust/run.sh`.

The suite runs every shared `../test/spec/*.tsv` fixture, the same files
the TypeScript and Go suites run, through the shared runner with a
fresh parser per row for the `opts` column; the vendored RFC 8259
corpus in all three option modes against the cross-runtime pin in
`../test/known-lenient.json`, failing rather than skipping when the
corpus is missing; the version test that holds `Cargo.toml`, `VERSION`
and `ts/package.json` together; and the in-language tests for what a
fixture cannot express: the port of the Go unit suite, the plugin's
group tags, option round-trips, layering on jsonic, the nesting
boundary, the embedded grammar against the file on disk, the shared
default parser under threads, and that reusing one instance beats
rebuilding it per parse.

## License

MIT.
