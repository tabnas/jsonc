# jsonc (Go)

A JSONC (JSON-with-comments) grammar plugin for the
[tabnas](https://github.com/tabnas/parser) parser, ported to Go. It
teaches the [jsonic](https://github.com/tabnas/jsonic) relaxed-JSON
grammar to parse JSONC: standard JSON plus single-line (`//`) and block
(`/* */`) comments, with optional trailing commas.

This is the Go port of [`@tabnas/jsonc`](../ts); the TypeScript version is
canonical.

## Install

```bash
go get github.com/tabnas/jsonc/go
```

`jsonc` is a plugin installed onto a `jsonic` instance (`jsonic`
re-exports the tabnas engine API in Go, so you only import these two).

## Example

```go
package main

import (
    "fmt"

    jsonic "github.com/tabnas/jsonic/go"
    jsonc "github.com/tabnas/jsonc/go"
)

func main() {
    j := jsonic.Make()
    j.Use(jsonc.Jsonc)

    result, err := j.Parse(`{ "name": "app", /* version */ "version": "1.0" }`)
    if err != nil {
        panic(err)
    }
    fmt.Println(result) // map[name:app version:1.0]
}
```

Enable trailing commas with an options map at install time:

```go
j := jsonic.Make()
j.Use(jsonc.Jsonc, map[string]any{"allowTrailingComma": true})
result, _ := j.Parse(`{ "debug": true, "verbose": false, }`)
// result == map[string]any{"debug": true, "verbose": false}
```

`Parse` returns `(any, error)`: objects are `map[string]any`, arrays are
`[]any`, numbers are `float64`, plus `string`, `bool`, and `nil`.

## Documentation

The docs follow the four [Diátaxis](https://diataxis.fr) quadrants:

- [Tutorial](doc/tutorial.md) — a guided first parse (learning).
- [How-to guide](doc/guide.md) — task recipes (install as a plugin, set
  options, handle errors, extend).
- [Reference](doc/reference.md) — the public API, every option, and the
  accepted syntax.
- [Concepts](doc/concepts.md) — how the plugin works on the engine, why,
  and how the Go version differs from TypeScript.

## Grammar diagram

The grammar is defined once in the repository-root `jsonc-grammar.jsonic`
and embedded into both `go/jsonc.go` and `ts/src/jsonc.ts`. Its railroad
diagram lives at [`../ts/doc/grammar.svg`](../ts/doc/grammar.svg) (ASCII:
[`../ts/doc/grammar.txt`](../ts/doc/grammar.txt)).

## License

MIT. Copyright (c) 2021-2025 Richard Rodger and contributors.
