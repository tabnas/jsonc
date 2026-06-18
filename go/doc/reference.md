# Reference (Go)

Complete, dry reference for the Go `jsonc` plugin: its public API, every
option, and the syntax it accepts. For a guided introduction see the
[tutorial](tutorial.md); for task recipes see the
[how-to guide](guide.md); for the why behind the design and the
differences from TypeScript see [concepts](concepts.md).

## Module

```bash
go get github.com/tabnas/jsonc/go
```

```go
import (
    jsonic "github.com/tabnas/jsonic/go"
    jsonc "github.com/tabnas/jsonc/go"
)
```

`jsonc` is a plugin and depends on `jsonic` (the base grammar, which
re-exports the tabnas engine API in Go). You install the plugin onto a
`jsonic` instance you build yourself.

## Public API

The package exports two names:

| Export | Kind | Description |
|---|---|---|
| `Jsonc` | function | The plugin. Pass to `j.Use(tabnasjsonc.Jsonc, opts?)`. |
| `Version` | `string` constant | The module version. |

### `Jsonc(j, pluginOpts)`

```go
func Jsonc(j *tabnasjsonic.Jsonic, pluginOpts map[string]any) error
```

The plugin function. You normally do not call it directly — pass it to
`Use`, which supplies the instance and the options map:

```go
j := tabnasjsonic.Make()
j.Use(tabnasjsonc.Jsonc, map[string]any{"allowTrailingComma": true})
```

When invoked, the plugin installs the embedded JSONC grammar on `j`, sets
comment lexing per `disallowComments`, and includes/excludes the
trailing-comma rule group per `allowTrailingComma`. It returns an `error`
only if installing the grammar fails (a programming bug, not a parse
error).

### Instance methods (from `jsonic`)

These come from the `jsonic`/tabnas engine, not this package:

| Method | Signature | Description |
|---|---|---|
| `tabnasjsonic.Make` | `func Make(opts ...Options) *tabnasjsonic.Jsonic` | Construct a parser instance. |
| `Use` | `func (j *Jsonic) Use(plugin, opts ...map[string]any) error` | Install a plugin. |
| `Parse` | `func (j *Jsonic) Parse(src string) (any, error)` | Parse a source string. |

```go
j := tabnasjsonic.Make()
j.Use(tabnasjsonc.Jsonc)
result, err := j.Parse(`{"a":1}`)
```

### Return types

`Parse` returns `any`; the concrete Go types are predictable:

| JSONC value | Go type |
|---|---|
| object | `map[string]any` |
| array | `[]any` |
| string | `string` |
| number | `float64` |
| `true` / `false` | `bool` |
| `null` | `nil` |
| empty / comment-only / whitespace-only input | `nil` |

```go
j := tabnasjsonic.Make()
j.Use(tabnasjsonc.Jsonc)

r, _ := j.Parse(`{ "a": false, "b": true, "c": [ 7.4 ] }`)
// r == map[string]any{"a": false, "b": true, "c": []any{7.4}}
```

## Options

Options are passed as a `map[string]any` to `Use`:

| Key | Type | Default | Effect |
|---|---|---|---|
| `allowTrailingComma` | `bool` | `false` | Permit a single trailing comma before `}` and `]`. When `false`, a trailing comma is an error. |
| `disallowComments` | `bool` | `false` | Reject `//` and `/* */` comments (strict-JSON lexing). When `false` (default), comments are allowed. |

Keys are read with a `bool` type assertion; anything not a `bool` (or
absent) is treated as `false`. Out of the box the behavior is "JSON plus
comments, no trailing commas".

```go
// allow trailing commas
a := tabnasjsonic.Make()
a.Use(tabnasjsonc.Jsonc, map[string]any{"allowTrailingComma": true})
a.Parse(`[ 1, 2, ]`)   // []any{float64(1), float64(2)}, nil

// strict JSON, no comments
s := tabnasjsonic.Make()
s.Use(tabnasjsonc.Jsonc, map[string]any{"disallowComments": true})
s.Parse(`[ 1, 2, null, "foo" ]`)   // []any{float64(1), float64(2), nil, "foo"}, nil
```

## Errors

`Parse` returns errors; it never panics. A syntax error is a
`*tabnasjsonic.JsonicError`. Type-assert to read its fields:

| Field | Type | Description |
|---|---|---|
| `Code` | `string` | Short error code, e.g. `"unexpected"`, `"unterminated_string"`. |
| `Detail` | `string` | Human-readable detail message. |
| `Pos` | `int` | 0-based character position in source. |
| `Row` | `int` | 1-based line number. |
| `Col` | `int` | 1-based column number. |
| `Src` | `string` | Source fragment at the error. |
| `Hint` | `string` | Additional explanatory text for this code. |

`err.Error()` renders a formatted, multi-line report with a
source-context extract.

Error codes you may encounter:

| Code | Cause |
|---|---|
| `unexpected` | No grammar alternate matched here (bad token, leading/doubled comma, capitalized keyword, bare `-`, etc.). |
| `unterminated_string` | A `"`-quoted string has no closing quote. |
| `unterminated_comment` | A `/* */` block comment is never closed. |

```go
j := tabnasjsonic.Make()
j.Use(tabnasjsonc.Jsonc)

_, err := j.Parse(`"abc`)
if je, ok := err.(*tabnasjsonic.JsonicError); ok {
    _ = je.Code // "unterminated_string"
    _ = je.Row  // 1
    _ = je.Col  // 1
}
```

## Syntax accepted

JSONC is JSON ([RFC 8259](https://tools.ietf.org/html/rfc8259)) with
comments and optional trailing commas. The grammar has five rules —
`val`, `map`, `list`, `pair`, `elem` — visualised in the railroad diagram
([../../ts/doc/grammar.svg](../../ts/doc/grammar.svg); ASCII version
[../../ts/doc/grammar.txt](../../ts/doc/grammar.txt)). The grammar text is
identical to the TypeScript version.

### Values

A value (`val`) is an object (`map`), an array (`list`), or a scalar
(`VAL`): a string, number, or keyword. End-of-input is also a valid
value, so comment-only / whitespace-only input yields `nil`.

### Objects and arrays

An object is `{ "KEY": val, ... }` with double-quoted string keys
(including the empty key `""`). An array is `[ val, val, ... ]`:

```go
j := tabnasjsonic.Make()
j.Use(tabnasjsonc.Jsonc)

j.Parse(`{ "": true }`)                      // map[string]any{"": true}
j.Parse(`{ "bar": 8, "xoo": "foo" }`)        // map[string]any{"bar": 8.0, "xoo": "foo"}
j.Parse(`[ { "a": null } ]`)                 // []any{map[string]any{"a": nil}}
```

### Strings

Double-quoted only. Standard JSON escapes: `\"` `\\` `\/` `\b` `\f` `\n`
`\r` `\t` and `\uXXXX`:

```go
j.Parse(`"Ü"`)   // "Ü"
```

(The Go string matcher also accepts `\v` as a built-in escape — a minor
deviation from the TS version; see [concepts](concepts.md).)

### Numbers

Integer, decimal, and scientific notation. No hex, octal, or binary;
bare `+` and bare `.` are rejected. All numbers return as `float64`:

```go
j.Parse(`123456789`)   // float64(123456789)
j.Parse(`-0.1`)        // -0.1
j.Parse(`1.2E-3`)      // 0.0012
j.Parse(`-1.93e-19`)   // -1.93e-19
```

### Keywords and comments

`true`, `false`, `null`, case-sensitive. Line comments run `//` to end of
line; block comments `/* */` do not nest. Comments are allowed anywhere
whitespace is and are discarded:

```go
j.Parse(`true`)                            // true
j.Parse(`false//hello`)                    // false
j.Parse(`/* g */ { "foo": //f` + "\n" + `"bar" }`) // map[string]any{"foo": "bar"}
```

With `disallowComments: true`, both comment forms are rejected.

### Trailing commas

Off by default. With `allowTrailingComma: true`, a single trailing comma
before the closing `}` or `]` is accepted; leading and doubled commas are
always rejected.

## Conformance note

The plugin layers JSONC rules on top of jsonic, which is intentionally
lenient in a few spots versus strict RFC 8259 (e.g. numbers with a
leading zero: `01` → `1`). See [concepts](concepts.md) for the full
accepted-vs-rejected discussion. If byte-perfect RFC 8259 rejection is
required, use an RFC-strict parser.
