# Divergences

TypeScript is the canonical implementation; the Go and Rust ports track
it. This file records where a port produces a **different result for
the same input**.

The TypeScript and Go implementations have no recorded divergence: both
accept and reject the same documents with the same error code, and
every option comes from the shared grammar text on both sides. There is
no `test/spec/divergent.tsv` register here for that reason. If one is
ever added it should carry `go`, `ts` and `rust` columns from the start
and the Rust suite should run it through `tabnas_support::Register`.

## The Rust port

Two departures, both rooted in the Rust engine rather than in this
plugin, and both pinned by `rs/tests/jsonc_test.rs`.

### Nesting is bounded at `DEPTH_LIMIT` (1,000) levels

| input | TypeScript | Go | Rust |
|---|---|---|---|
| 1,000 nested `[` ... `]` | accepted | accepted | accepted |
| 1,001 nested `[` ... `]` | accepted | accepted | `ERROR: cancel` |
| 100,000 `[` (unclosed) | `ERROR: end_of_source` | `ERROR: end_of_source` | `ERROR: cancel` |

The engine's cost per iteration grows with the height of its rule
stack, so a parse costs time quadratic in the nesting depth (measured
in a debug build: 800 levels 2.7 s, 1,600 levels 11.7 s, 3,200 levels
54 s, while flat input scales linearly). The RFC 8259 corpus's
`n_structure_100000_opening_arrays` and `n_structure_open_array_object`
would take hours each, so `tabnas_jsonc::jsonc` sets a parse budget
that cancels at the limit, counted from the container rules the way
`tabnas-json` counts its own. The limit is above the 500 levels that
`test/known-lenient.json` pins as accepted, so the corpus classification
is the same in all three runtimes; only a document deeper than 1,000
levels, which the TypeScript plugin would accept, is refused here.

The repair belongs in the engine (`tabnas/parser` `rs/`); when its
per-depth cost is linear the limit can go and this entry with it.

### A trivia-only document is `null`

| input | TypeScript | Go | Rust |
|---|---|---|---|
| `// only a comment` | `undefined` | `nil` | `Null` |
| `  \n  ` | `undefined` | `nil` | `Null` |

The Rust engine folds a top-level `Undefined` into `Value::Null` at the
end of every parse. The serialized value agrees across the three, and
the fixtures spell the case `UNDEFINED`, which the Go and Rust runners
both read as their null. A `null` document and a trivia-only document
are told apart in TypeScript and not here.

## Inherited from the engine

The Rust port inherits the engine-level splits recorded in
`tabnas/parser`'s own `DIVERGENCE.md`: lone surrogates fold to U+FFFD,
and the regular expression dialect is the `regex` crate's, with no
lookaround. A divergence seen here is more often inherited than
introduced; check upstream first.

## Not divergences

These differ between the ports but never change a successful parse
value:

- **Error message text.** Only the error `code` is contractual.
- **Host type representation.** Go returns `float64` for every number;
  Rust `f64`; TypeScript a `number`. The serialized bytes agree.
- **Key order.** Rust keeps document order through an `IndexMap`, as
  jsonic's Go `OrderedMap` does.
