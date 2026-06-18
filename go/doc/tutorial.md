# Tutorial — your first JSONC parse (Go)

This walks you from nothing to a working JSONC parse in Go, then through
one option and one error. Follow it in order; each step builds on the
last. When you finish you will have installed the plugin, parsed JSON
with comments, enabled trailing commas, and handled a parse error.

`jsonc` is a **plugin**, not a standalone parser. It teaches the
[`jsonic`](https://github.com/tabnas/jsonic) relaxed-JSON grammar to
accept the JSONC dialect: JSON plus `//` and `/* */` comments, with
optional trailing commas. (`jsonic` re-exports the underlying tabnas
engine API in Go, so you only import these two packages.)

For a recipe-style index of individual tasks, see the
[how-to guide](guide.md). For exhaustive signatures, see the
[reference](reference.md).

## 1. Install

```bash
go get github.com/tabnas/jsonc/go
```

Import the base grammar and the plugin:

```go
import (
    jsonic "github.com/tabnas/jsonic/go"
    jsonc "github.com/tabnas/jsonc/go"
)
```

## 2. Build a parser and parse JSON

Make a `jsonic` instance, install the `Jsonc` plugin with `Use`, then
call `Parse`. `Parse` returns `(any, error)`:

```go
package main

import (
    "fmt"

    jsonic "github.com/tabnas/jsonic/go"
    jsonc "github.com/tabnas/jsonc/go"
)

func main() {
    j := tabnasjsonic.Make()
    j.Use(tabnasjsonc.Jsonc)

    result, err := j.Parse(`{"a":1}`)
    if err != nil {
        panic(err)
    }
    fmt.Println(result) // map[a:1]
}
```

The result is `map[string]any{"a": float64(1)}`. Numbers always come back
as `float64`; objects are `map[string]any`, arrays are `[]any`.

## 3. Add comments

The reason to reach for JSONC is comments. Both line (`//`) and block
(`/* */`) comments are allowed anywhere whitespace is — including between
a key and its value:

```go
j := tabnasjsonic.Make()
j.Use(tabnasjsonc.Jsonc)

r, _ := j.Parse(`{ "foo": /*hello*/true }`)
// r == map[string]any{"foo": true}

r, _ = j.Parse(`1.2E-3 // comment`)
// r == 0.0012
```

A document that is *only* comments and whitespace parses to `nil`:

```go
r, _ := j.Parse(`// just a comment`)
// r == nil
```

## 4. Allow trailing commas

By default a trailing comma before `}` or `]` is a syntax error, just
like strict JSON. Pass an options map when you install the plugin to
permit it:

```go
j := tabnasjsonic.Make()
j.Use(tabnasjsonc.Jsonc, map[string]any{"allowTrailingComma": true})

r, _ := j.Parse(`{ "hello": [], }`)
// r == map[string]any{"hello": []any{}}

r, _ = j.Parse(`[ 1, 2, ]`)
// r == []any{float64(1), float64(2)}
```

The option is set once, at install time. The instance is reusable: call
`j.Parse(...)` as many times as you like.

## 5. Handle an error

Go does not throw — `Parse` returns the error as its second value. Check
it, and type-assert to `*tabnasjsonic.JsonicError` for the structured fields:

```go
j := tabnasjsonic.Make()
j.Use(tabnasjsonc.Jsonc)

_, err := j.Parse(`"abc`) // a string that is never closed
if err != nil {
    if je, ok := err.(*tabnasjsonic.JsonicError); ok {
        fmt.Println(je.Code) // "unterminated_string"
        fmt.Println(je.Row)  // 1
        fmt.Println(je.Col)  // 1
    }
}
```

`err.Error()` is a formatted, multi-line report with a source-context
extract you can show a user; the struct fields are for branching in code.

## Where to go next

- [How-to guide](guide.md) — focused recipes for individual tasks.
- [Reference](reference.md) — the public API, every option, and the
  accepted syntax.
- [Concepts](concepts.md) — how the plugin works on the engine, and how
  the Go version differs from TypeScript.
