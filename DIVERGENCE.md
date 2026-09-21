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

### Nesting is bounded at `DEPTH_LIMIT` (512) levels

| input | TypeScript | Go | Rust |
|---|---|---|---|
| 500 nested `[` ... `]` | accepted | accepted | accepted |
| 512 nested `[` ... `]` | accepted | accepted | accepted |
| 513 nested `[` ... `]` | accepted | accepted | `ERROR: cancel` |
| 100,000 `[` (unclosed) | `ERROR: end_of_source` | `ERROR: end_of_source` | `ERROR: cancel` |

Both other columns are measured, not inferred: the Go one on this
repository's `go/` port against the module cache, the TypeScript one on
`ts/src/jsonc.ts` built against the canonical `@tabnas/jsonic` and
`@tabnas/parser` sources. Neither sets a budget of any kind, and the
TypeScript run accepts 5,000 levels as readily as 513.

Two engine costs meet here, and the limit sits between them.

Time is the first. The engine's cost per iteration grows with the
height of its rule stack, so a parse costs time quadratic in the
nesting depth (measured in a debug build: 100 levels 0.07 s, 200
levels 0.30 s, 400 levels 1.02 s, 500 levels 1.61 s, while flat input
and long strings scale linearly). The RFC 8259 corpus's
`n_structure_100000_opening_arrays` and `n_structure_open_array_object`
would take hours each, so `tabnas_jsonc::jsonc` sets a parse budget
that cancels at the limit, counted from the container rules the way
`tabnas-json` counts its own.

Stack is the second, and it sets the ceiling. `Value::to_json` recurses
once per level, about 2.2 KiB of stack per level in a debug build, so a
thread created with the standard library's default 2 MiB stack aborts
between 920 and 950 levels. An abort is not catchable, so a limit above
that band would let untrusted input end the process of any caller that
parses on a worker thread and then reads the result. The limit has to
stay below what the smallest realistic caller can walk.

That leaves the band 500 to roughly 920, and 512 sits in it: above the
500 levels `test/known-lenient.json` pins as accepted, so the corpus
classification is the same in all three runtimes, and far enough below
the stack wall to leave room. Only a document deeper than 512 levels,
which the TypeScript plugin would accept, is refused here.

No fixture row can carry this one either: the input is thousands of
brackets, far larger than a cell. It is pinned instead by
`nesting_deeper_than_the_limit_is_cancelled`, which measures the parse
boundary, by `a_limit_deep_value_walks_on_a_default_thread_stack`,
which measures the stack ceiling, and by the corpus test, which fails
if the limit ever drops below the 500 levels `test/known-lenient.json`
pins as accepted.

The repair belongs in the engine (`tabnas/parser` `rs/`): when its
per-depth cost is linear and its value walk no longer recurses, the
limit can go and this entry with it.

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

A fixture row cannot carry this one: the comparison runs on the
flattened JSON, where a top-level undefined and a null are the same
`null`, so a row would pass either way. It is pinned instead by
`a_trivia_only_document_is_null_and_not_undefined`, which compares the
`Value` itself.

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
