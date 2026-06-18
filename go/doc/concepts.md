# Concepts (Go)

Background on how the Go `jsonc` plugin works, and how it differs from the
canonical TypeScript version. This is understanding-oriented reading — for
steps see the [tutorial](tutorial.md) and [how-to guide](guide.md), and
for exact signatures see the [reference](reference.md).

## JSONC is a plugin, not a parser

The Go `jsonc` package does not parse anything by itself. It is a
**plugin** that configures an existing parser:

- the **tabnas engine** — a rule-based parser over a configurable,
  matcher-based lexer (re-exported through `jsonic` in Go); and
- the [`jsonic`](https://github.com/tabnas/jsonic) **base grammar** — the
  relaxed-JSON rules (`val`, `map`, `list`, `pair`, `elem`).

`Jsonc` runs when you call `j.Use(jsonc.Jsonc, opts)`. It does **not** add
rules of its own. It tightens jsonic's lenient defaults toward standard
JSON, switches comment lexing on or off, and installs a small number of
extra **alternates** on rules jsonic already provides. That is the whole
plugin — a configuration delta on a general engine.

## What the plugin installs

The grammar delta is authored once, in the repository-root
`jsonc-grammar.jsonic`, and embedded verbatim into both the Go
(`go/jsonc.go`) and TypeScript (`ts/src/jsonc.ts`) sources by
`embed-grammar.js`. The Go and TS grammar text are identical. It does two
kinds of thing.

**Tighten lexer/value options toward JSON.** jsonic accepts bare unquoted
text, hex/octal/binary numbers, alternate quotes, and more. The grammar
turns these off: `text.lex = false`, `number.hex/oct/bin = false`,
`string.chars = '"'` (double quotes only), and map-key extension disabled.
The result reads like JSON rather than the looser jsonic dialect.

**Add three alternates.** On top of jsonic's rules it installs:

- an end-of-input alternate (`#ZZ`) on `val`, so comment-only or
  whitespace-only input resolves to `nil` instead of erroring;
- a trailing-comma alternate on `pair` close (`#CA #CB` — comma then
  close-brace); and
- a trailing-comma alternate on `elem` close (`#CA #CS` — comma then
  close-square).

Each installed alternate is tagged with the group `jsonc` (via the
`GrammarText(..., &GrammarSetting{Rule: {Alt: {G: "jsonc"}}})` setting),
which lets the plugin's runtime options selectively include or exclude
them.

## How the two options take effect

The two options do not rewrite the grammar — they flip runtime switches
the grammar already exposes.

`disallowComments` controls **lexing**: the plugin sets
`Comment.Lex = !disallowComments`. With comments disallowed, the comment
matcher is not built, so `//` and `/* */` become `unexpected` tokens.

`allowTrailingComma` controls **rule inclusion**: the plugin always
includes the `jsonc` and `json` rule groups, and excludes the `comma`
group unless the option is set. The trailing-comma alternates carry the
`comma` tag, so excluding that group removes exactly those alternates.
This is why one grammar text serves all four configurations.

## Two stages: lexer, then parser

A parse runs in two stages inherited from the engine. The **lexer** turns
text into tokens using independent matchers (the JSONC config narrows
these to double-quote strings, JSON-shaped numbers, comments on/off). The
ignorable tokens — comments, newlines, whitespace — are dropped, which is
why a comment can sit between a key and its value. The **parser** consumes
tokens with at most two tokens of lookahead per alternate; the
trailing-comma alternates match "comma then closing bracket", and the
end-of-input alternate closes off the top-level `val`. There is no
backtracking search, so parsing is linear.

## Accepted vs. rejected edge cases

The grammar pushes jsonic toward JSON, but jsonic stays intentionally
lenient in a few places.

**Accepted, though strict RFC 8259 rejects:** numbers with a leading zero
(`01` → `1`, `-01` → `-1`) and a few malformed-number / unquoted-key
shapes.

**Rejected, as JSON requires:** unterminated strings
(`unterminated_string`) and comments (`unterminated_comment`),
capitalized/partial keywords (`True`) and bare `-` (`unexpected`), leading
and doubled commas, trailing commas (unless `allowTrailingComma`), and
comments (when `disallowComments`).

If you need byte-perfect RFC 8259 conformance, use an RFC-strict parser.

## Differences from the TS version

The TypeScript implementation is authoritative; the Go package is a
faithful port. Successful parse *values* are identical (the same JSONC
input produces the same structure). The differences are in API shape,
host-language types, and a couple of edge cases.

### API shape

| Aspect | TypeScript | Go |
|---|---|---|
| Build instance | `new Tabnas().use(jsonic).use(Jsonc)` | `jsonic.Make()` then `j.Use(jsonc.Jsonc)` |
| Plugin signature | `Jsonc(tn, options?): void` | `Jsonc(j *jsonic.Jsonic, opts map[string]any) error` |
| Options | object `{ allowTrailingComma?, disallowComments? }` | `map[string]any{"allowTrailingComma": ..., "disallowComments": ...}` |
| Parse call | `j.parse(src)` → value or **throws** | `j.Parse(src)` → `(any, error)`, **never panics** |
| Base import | `@tabnas/parser` (engine) + `@tabnas/jsonic` | `jsonic` only (it re-exports the engine) |

You install `jsonic` explicitly as a separate `.use()` step in TS; in Go,
`jsonic.Make()` already includes the base grammar, so you only `Use` the
`Jsonc` plugin.

### Value types

TypeScript returns native JS values (`any`); Go returns `any` with
predictable concrete types:

| Value | TypeScript | Go |
|---|---|---|
| object | plain object | `map[string]any` |
| array | `Array` | `[]any` |
| string | `string` | `string` |
| number | `number` | `float64` |
| boolean | `boolean` | `bool` |
| null | `null` | `nil` |
| empty / comment-only input | `undefined` | `nil` |

### Errors

| Aspect | TypeScript | Go |
|---|---|---|
| Delivery | thrown `TabnasError` | returned `*jsonic.JsonicError` |
| Location fields | `err.lineNumber`, `err.columnNumber` | `je.Row`, `je.Col` (plus `je.Pos`, `je.Src`) |
| Code field | `err.code` | `je.Code` |
| Detail | `err.message` (formatted) | `je.Error()` (formatted), `je.Detail` (short) |

The error `Code` is the same string in both (`unterminated_string`,
`unexpected`, etc.) for the same failure, with one known exception below.

### Known accepted differences

- **`\v` string escape.** The Go string matcher accepts `\v` (vertical
  tab) as a built-in escape; the TS version rejects it (`unexpected`).
  This is a minor lexer deviation and is noted in `go/jsonc_test.go`.
- **Some error codes for malformed strings.** A raw control character
  inside a string reports `unprintable` in TS but `unterminated_string`
  in Go (an engine-level difference inherited from the parser port). Both
  fail at the same row/column; only the `Code` differs. Branch on `Code`
  with this in mind.

### Why this design

Keeping JSONC as a thin plugin lets the same engine drive strict JSON,
plain jsonic, and any plugin you write. The Go and TS ports stay in
lockstep because they **embed the identical grammar text**, and behavior
is option-conditional via lexer config and rule-group inclusion rather
than separate code paths.
