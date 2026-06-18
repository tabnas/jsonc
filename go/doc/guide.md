# How-to guide (Go)

Short, task-focused recipes. Each is self-contained and assumes you have
the module installed (see the [tutorial](tutorial.md) for the basics).
For full signatures and the option table, see the [reference](reference.md).

Every recipe uses these imports:

```go
import (
    jsonic "github.com/tabnas/jsonic/go"
    jsonc "github.com/tabnas/jsonc/go"
)
```

## Install the plugin

`Jsonc` is a plugin. Make a `jsonic` instance, install `Jsonc` with
`Use`, then `Parse`. Build the instance **once** and reuse it — building
the grammar is the expensive step, and rebuilding it per parse is the
performance footgun the package guards against in its tests:

```go
j := tabnasjsonic.Make()
if err := j.Use(tabnasjsonc.Jsonc); err != nil {
    // a grammar install error (rare; usually a programming bug)
    panic(err)
}

result, err := j.Parse(`{ "name": "app", /* v */ "version": "1.0" }`)
// result == map[string]any{"name": "app", "version": "1.0"}
```

`Use` takes the plugin and an optional options map. It returns an `error`
from installing the grammar, separate from parse errors.

## Allow trailing commas

Pass `allowTrailingComma: true` in the options map at install time. A
single trailing comma before `}` or `]` is then accepted in both objects
and arrays:

```go
j := tabnasjsonic.Make()
j.Use(tabnasjsonc.Jsonc, map[string]any{"allowTrailingComma": true})

r, _ := j.Parse(`{ "hello": [], "world": {}, }`)
// r == map[string]any{"hello": []any{}, "world": map[string]any{}}

r, _ = j.Parse(`[ 1, 2, ]`)
// r == []any{float64(1), float64(2)}
```

Without this option, the same inputs return an error. This permits *one*
trailing comma — leading (`[ ,1 ]`) and doubled (`[ 1,, 2 ]`) commas are
always errors.

## Parse strict JSON (reject comments)

Pass `disallowComments: true` to turn off comment lexing. The parser then
rejects both `//` and `/* */`:

```go
nc := tabnasjsonic.Make()
nc.Use(tabnasjsonc.Jsonc, map[string]any{"disallowComments": true})

r, _ := nc.Parse(`[ 1, 2, null, "foo" ]`)
// r == []any{float64(1), float64(2), nil, "foo"}

_, err := nc.Parse(`{ "foo": /*comment*/ true }`)
// err != nil  — comments are no longer allowed
```

## Handle parse errors

`Parse` returns errors; it never panics. Type-assert to
`*tabnasjsonic.JsonicError` for the structured fields:

```go
j := tabnasjsonic.Make()
j.Use(tabnasjsonc.Jsonc)

_, err := j.Parse(`{ "bad": }`) // missing value
if err != nil {
    if je, ok := err.(*tabnasjsonic.JsonicError); ok {
        _ = je.Code   // short code string, e.g. "unexpected"
        _ = je.Row    // 1-based line number
        _ = je.Col    // 1-based column number
        _ = je.Detail // human-readable detail
    }
    // err.Error() is a formatted multi-line report with source context
}
```

Common codes: `unexpected` (no rule matched here), `unterminated_string`
(a `"` is never closed), `unterminated_comment` (a `/* */` block is never
closed).

## Parse a config file

JSONC is the format VS Code uses for `tsconfig.json`, `settings.json`,
and similar files — which often carry comments and trailing commas. Read
the file and parse its text:

```go
src, err := os.ReadFile("tsconfig.json")
if err != nil {
    return err
}
j := tabnasjsonic.Make()
j.Use(tabnasjsonc.Jsonc, map[string]any{"allowTrailingComma": true})
config, err := j.Parse(string(src))
```

## Layer your own grammar on top

`Jsonc` is one plugin among potentially many. Install additional plugins
after it; each extends the same instance:

```go
j := tabnasjsonic.Make()
j.Use(tabnasjsonc.Jsonc)   // JSONC: comments + optional trailing commas
j.Use(myPlugin)      // your own rule/option extensions
```

See [Concepts](concepts.md) for what `Jsonc` actually installs (a handful
of alternates on jsonic's `val`, `pair`, and `elem` rules) before you
extend it.
