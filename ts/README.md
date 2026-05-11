# @jsonic/jsonc

This plugin allows the [Jsonic](https://jsonic.senecajs.org) JSON parser
to parse [JSONC](https://github.com/microsoft/node-jsonc-parser) format
files (JSON with Comments).

JSONC is a strict superset of JSON that adds single-line (`//`) and
block (`/* */`) comments. Trailing commas in objects and arrays can be
optionally enabled.

[![npm version](https://img.shields.io/npm/v/@jsonic/jsonc.svg)](https://npmjs.com/package/@jsonic/jsonc)
[![build](https://github.com/jsonicjs/jsonc/actions/workflows/build.yml/badge.svg)](https://github.com/jsonicjs/jsonc/actions/workflows/build.yml)
[![Coverage Status](https://coveralls.io/repos/github/jsonicjs/jsonc/badge.svg?branch=main)](https://coveralls.io/github/jsonicjs/jsonc?branch=main)
[![Known Vulnerabilities](https://snyk.io/test/github/jsonicjs/jsonc/badge.svg)](https://snyk.io/test/github/jsonicjs/jsonc)


| ![Voxgig](https://www.voxgig.com/res/img/vgt01r.png) | This open source module is sponsored and supported by [Voxgig](https://www.voxgig.com). |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |


The documentation below is organized along the
[Diátaxis](https://diataxis.fr) quadrants:

- [Quick start](#quick-start) — tutorial
- [How-to guides](#how-to-guides) — task recipes
- [Reference](#reference) — API surface
- [JSONC format](#jsonc-format) — explanation


## Quick start

### TypeScript

Install:

```bash
npm install @jsonic/jsonc @jsonic/jsonic-next
```

Parse:

```typescript
import { Jsonic } from '@jsonic/jsonic-next'
import { Jsonc } from '@jsonic/jsonc'

const j = Jsonic.make().use(Jsonc)

const result = j('{ "name": "app", /* version */ "version": "1.0" }')
// => { name: 'app', version: '1.0' }
```

### Go

Install:

```bash
go get github.com/jsonicjs/jsonc/go
```

Parse:

```go
package main

import (
    "fmt"
    jsonic "github.com/jsonicjs/jsonic/go"
    jsonc "github.com/jsonicjs/jsonc/go"
)

func main() {
    j := jsonic.Make()
    j.Use(jsonc.Jsonc)

    result, err := j.Parse(`{ "name": "app", /* version */ "version": "1.0" }`)
    if err != nil {
        panic(err)
    }
    fmt.Println(result)
    // => map[name:app version:1.0]
}
```


## How-to guides

### Allow trailing commas

TypeScript:

```typescript
const j = Jsonic.make().use(Jsonc, { allowTrailingComma: true })
j('{ "debug": true, "verbose": false, }')
// => { debug: true, verbose: false }
```

Go:

```go
j := jsonic.Make()
j.Use(jsonc.Jsonc, map[string]any{"allowTrailingComma": true})
result, _ := j.Parse(`{ "debug": true, "verbose": false, }`)
```

### Parse strict JSON (disable comments)

TypeScript:

```typescript
const j = Jsonic.make().use(Jsonc, { disallowComments: true })
j('{ "foo": /* not allowed */ true }') // throws
```

Go:

```go
j := jsonic.Make()
j.Use(jsonc.Jsonc, map[string]any{"disallowComments": true})
```

### Handle parse errors

TypeScript — parse errors throw:

```typescript
try {
  j('{ "bad": }')
} catch (err) {
  console.error(err.message)
}
```

Go — errors are returned:

```go
if _, err := j.Parse(`{ "bad": }`); err != nil {
    fmt.Println(err)
}
```

### Parse a file

TypeScript:

```typescript
import { readFileSync } from 'node:fs'
const j = Jsonic.make().use(Jsonc, { allowTrailingComma: true })
const config = j(readFileSync('tsconfig.json', 'utf8'))
```

Go:

```go
src, _ := os.ReadFile("tsconfig.json")
j := jsonic.Make()
j.Use(jsonc.Jsonc, map[string]any{"allowTrailingComma": true})
config, _ := j.Parse(string(src))
```


## Reference

### TypeScript

```typescript
function Jsonc(jsonic: Jsonic, options?: JsoncOptions): void

type JsoncOptions = {
  allowTrailingComma?: boolean  // default: false
  disallowComments?: boolean    // default: false
}
```

Register with `jsonic.use(Jsonc, options?)`. After registration, invoke
the jsonic instance as a function on a source string; it returns the
parsed value or throws on syntax errors.

| Option | Type | Default | Effect |
|--------|------|---------|--------|
| `allowTrailingComma` | `boolean` | `false` | Permit a trailing comma before `}` and `]` |
| `disallowComments` | `boolean` | `false` | Reject `//` and `/* */` comments (strict JSON) |

### Go

```go
func Jsonc(j *jsonic.Jsonic, pluginOpts map[string]any) error
```

Register with `j.Use(jsonc.Jsonc)` or `j.Use(jsonc.Jsonc, opts)` where
`opts` is a `map[string]any`. `Parse` then returns `(any, error)` —
`map[string]any` for objects, `[]any` for arrays, `float64` for numbers,
`string`, `bool`, or `nil`.

| Key | Type | Default | Effect |
|-----|------|---------|--------|
| `allowTrailingComma` | `bool` | `false` | Permit a trailing comma before `}` and `]` |
| `disallowComments` | `bool` | `false` | Reject `//` and `/* */` comments (strict JSON) |


## JSONC format

JSONC follows [RFC 8259](https://tools.ietf.org/html/rfc8259) (JSON)
with these extensions:

- **Line comments**: `//` to end of line
- **Block comments**: `/* */` (non-nesting)
- **Trailing commas**: optional, in objects and arrays

All other JSON rules apply:

- Strings must be double-quoted
- Standard escapes only: `\"` `\\` `\/` `\b` `\f` `\n` `\r` `\t` `\uXXXX`
- Numbers: integer, decimal, scientific notation (no hex, octal, binary)
- Keywords: `true`, `false`, `null` (case-sensitive)
- Property names must be double-quoted strings

### Conformance notes

The plugin layers JSONC rules on top of jsonic, which is intentionally
lenient in some places vs. strict RFC 8259. The test suite runs the
[nst/JSONTestSuite](https://github.com/nst/JSONTestSuite) corpus in
strict mode (`disallowComments: true`) and pins the known-lenient
cases in `test/jsontestsuite.test.ts` (see `N_KNOWN_LENIENT`). Examples
of accepted-but-non-RFC input include numbers with leading zeros and
unquoted object keys. Use an RFC-strict parser if byte-perfect RFC 8259
rejection is required.


## Acknowledgments

Conformance testing uses third-party corpora under MIT License:

- [nst/JSONTestSuite](https://github.com/nst/JSONTestSuite) by Nicolas
  Seriot — vendored at `test/JSONTestSuite/` (the `test_parsing/` corpus).
- [microsoft/node-jsonc-parser](https://github.com/microsoft/node-jsonc-parser) —
  parse-level test cases ported into `test/jsonc.test.ts`.

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for details.


## License

MIT. Copyright (c) 2021-2025 Richard Rodger and contributors.
