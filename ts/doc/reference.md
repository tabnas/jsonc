# Reference

Complete, dry reference for the `@tabnas/jsonc` plugin: its public API,
every option, and the syntax it accepts. For a guided introduction see
the [tutorial](tutorial.md); for task recipes see the
[how-to guide](guide.md); for the why behind the design see
[concepts](concepts.md).

## Package

```bash
npm install @tabnas/parser @tabnas/jsonic @tabnas/jsonc
```

`@tabnas/jsonc` is a plugin and depends (as peer dependencies) on
`@tabnas/parser` (the engine) and `@tabnas/jsonic` (the base grammar).
Install all three.

## Exports

The module exports exactly two names:

| Export | Kind | Description |
|---|---|---|
| `Jsonc` | function | The plugin. Pass to `instance.use(Jsonc, options?)`. |
| `JsoncOptions` | type | The options object accepted by the plugin. |

```ts
import { Jsonc } from '@tabnas/jsonc'
import type { JsoncOptions } from '@tabnas/jsonc'
```

There is no standalone parse function — `Jsonc` only configures an engine
instance you build yourself.

## The plugin

### `Jsonc(tn, options?)`

```ts
function Jsonc(tn: Tabnas, options?: JsoncOptions): void
```

Install with `tn.use(Jsonc, options?)`. The plugin:

1. Installs the embedded JSONC grammar on `tn` (via `tn.grammar(...)`).
2. Sets comment lexing on/off per `disallowComments`.
3. Includes the `jsonc` and `json` rule groups, and excludes the
   trailing-comma group unless `allowTrailingComma` is set.

`use()` runs the plugin immediately and returns the instance, so calls
chain. The base grammar must be installed first:

```ts
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'

const j = new Tabnas().use(jsonic).use(Jsonc, { allowTrailingComma: true })
```

### Parsing

After installation, parse with the engine's `parse` method:

```ts
instance.parse(src: string): any
```

It returns the parsed value, or throws a `TabnasError` on a syntax error.
The returned types are the native JavaScript equivalents:

| JSONC value | JavaScript type |
|---|---|
| object | plain object |
| array | `Array` |
| string | `string` |
| number | `number` |
| `true` / `false` | `boolean` |
| `null` | `null` |
| empty / comment-only / whitespace-only input | `undefined` |

```js
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'

const j = new Tabnas().use(jsonic).use(Jsonc)

j.parse('{ "a": false, "b": true, "c": [ 7.4 ] }')
// => { a: false, b: true, c: [7.4] }
j.parse('// just a comment')   // => undefined
```

## Options

```ts
type JsoncOptions = {
  allowTrailingComma?: boolean
  disallowComments?: boolean
}
```

| Option | Type | Default | Effect |
|---|---|---|---|
| `allowTrailingComma` | `boolean` | `false` | Permit a single trailing comma before `}` and `]`. When `false`, a trailing comma is a syntax error. |
| `disallowComments` | `boolean` | `false` | Reject `//` and `/* */` comments (strict-JSON lexing). When `false` (default), comments are allowed. |

Both options default to off, so the out-of-the-box behavior is "JSON plus
comments, no trailing commas" — the common JSONC reading.

```js
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'

// allow trailing commas
const a = new Tabnas().use(jsonic).use(Jsonc, { allowTrailingComma: true })
a.parse('[ 1, 2, ]')   // => [1, 2]

// strict JSON, no comments
const s = new Tabnas().use(jsonic).use(Jsonc, { disallowComments: true })
s.parse('[ 1, 2, null, "foo" ]')   // => [1, 2, null, 'foo']
```

## Errors

A failed parse throws a `TabnasError` (imported from `@tabnas/parser` if
you need the type). Useful fields:

| Field | Description |
|---|---|
| `code` | Short error code string (e.g. `'unexpected'`, `'unterminated_string'`). |
| `lineNumber` | 1-based line number of the error. |
| `columnNumber` | 1-based column number of the error. |
| `message` | Formatted, multi-line human-readable report with a source-context extract. |

Error codes you may encounter:

| Code | Cause |
|---|---|
| `unexpected` | No grammar alternate matched here (bad token, leading/doubled comma, capitalized keyword, bare `-`, etc.). |
| `unterminated_string` | A `"`-quoted string has no closing quote. |
| `unterminated_comment` | A `/* */` block comment is never closed. |
| `unprintable` | A raw control character (code point below 32, e.g. a literal tab or newline) appears inside a string. |

```js
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'

const j = new Tabnas().use(jsonic).use(Jsonc)

try { j.parse('"abc') } catch (err) {
  err.code   // => 'unterminated_string'
}
```

## Syntax accepted

JSONC is JSON ([RFC 8259](https://tools.ietf.org/html/rfc8259)) with
comments and optional trailing commas. The grammar has five rules —
`val`, `map`, `list`, `pair`, `elem` — visualised in the
[railroad diagram](grammar.svg) (ASCII version: [grammar.txt](grammar.txt)).

### Values

A value (`val`) is an object (`map`), an array (`list`), or a scalar
(`VAL`): a string, number, or keyword. End-of-input is also a valid
value, so comment-only / whitespace-only input yields `undefined`.

### Objects

An object is `{ pair, pair, ... }`. Each `pair` is `"KEY" : val`. Keys
are double-quoted strings, including the empty key `""`:

```js
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'
const j = new Tabnas().use(jsonic).use(Jsonc)

j.parse('{ "": true }')                          // => { '': true }
j.parse('{ "bar": 8, "xoo": "foo" }')            // => { bar: 8, xoo: 'foo' }
j.parse('{ "hello": { "again": { "inside": 5 }, "world": 1 }}')
// => { hello: { again: { inside: 5 }, world: 1 } }
```

### Arrays

An array is `[ elem, elem, ... ]`, where each `elem` is a `val`:

```js
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'
const j = new Tabnas().use(jsonic).use(Jsonc)

j.parse('[ [],  [ [] ]]')        // => [[], [[]]]
j.parse('[ { "a": null } ]')     // => [{ a: null }]
```

### Strings

Double-quoted only. Standard JSON escapes: `\"` `\\` `\/` `\b` `\f` `\n`
`\r` `\t` and `\uXXXX`. Raw control characters inside a string are
rejected (`unprintable`):

```js
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'
const j = new Tabnas().use(jsonic).use(Jsonc)

j.parse('"\\"-\\\\-\\/-\\b-\\f-\\n-\\r-\\t"')   // => '"-\\-/-\b-\f-\n-\r-\t'
j.parse('"\\u00DC"')                            // => 'Ü'
```

### Numbers

Integer, decimal, and scientific-notation numbers. No hex, octal, or
binary. Leading `+` and a bare `.` are rejected:

```js
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'
const j = new Tabnas().use(jsonic).use(Jsonc)

j.parse('123456789')   // => 123456789
j.parse('-0.1')        // => -0.1
j.parse('1.2E-3')      // => 0.0012
j.parse('-1.93e-19')   // => -1.93e-19
```

### Keywords

`true`, `false`, and `null`, case-sensitive. `True`, `nulllll`, and
similar are errors:

```js
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'
const j = new Tabnas().use(jsonic).use(Jsonc)

j.parse('true')          // => true
j.parse('null')          // => null
j.parse('false//hello')  // => false
```

### Comments

Line comments run `//` to end of line; block comments are `/* */` and do
not nest. They are allowed anywhere whitespace is, and are discarded:

```js
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'
const j = new Tabnas().use(jsonic).use(Jsonc)

j.parse('/* g */ { "foo": //f\n"bar" }')   // => { foo: 'bar' }
```

With `disallowComments: true`, both comment forms are rejected.

### Trailing commas

Off by default. With `allowTrailingComma: true`, a single trailing comma
before the closing `}` or `]` is accepted; leading and doubled commas are
always rejected.

## Conformance note

The plugin layers JSONC rules on top of jsonic, which is intentionally
lenient in a few spots versus strict RFC 8259. The repository runs the
[nst/JSONTestSuite](https://github.com/nst/JSONTestSuite) corpus in strict
mode (`disallowComments: true`) and pins the known-lenient cases in
`ts/test/jsontestsuite.test.ts` (`N_KNOWN_LENIENT`). Examples of
accepted-but-non-RFC input include numbers with a leading zero (`01` →
`1`) and a few unquoted-key shapes. If byte-perfect RFC 8259 rejection is
required, use an RFC-strict parser. See [concepts](concepts.md) for the
full accepted-vs-rejected discussion.
