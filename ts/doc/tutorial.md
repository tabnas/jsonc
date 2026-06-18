# Tutorial — your first JSONC parse

This walks you from nothing to a working JSONC parse, then through one
option and one error. Follow it in order; each step builds on the last.
When you finish you will have installed the plugin, parsed JSON with
comments, enabled trailing commas, and handled a parse error.

`@tabnas/jsonc` is a **plugin**, not a standalone parser. It teaches the
[`@tabnas/jsonic`](https://github.com/tabnas/jsonic) relaxed-JSON grammar
running on the [`@tabnas/parser`](https://github.com/tabnas/parser)
engine to accept the JSONC dialect: JSON plus `//` and `/* */` comments,
with optional trailing commas.

For a recipe-style index of individual tasks, see the
[how-to guide](guide.md). For exhaustive signatures, see the
[reference](reference.md).

## 1. Install

You need all three packages — the engine, the base grammar, and this
plugin:

```bash
npm install @tabnas/parser @tabnas/jsonic @tabnas/jsonc
```

## 2. Build a parser and parse JSON

Construct a `Tabnas` engine, install the `jsonic` base grammar, then
install the `Jsonc` plugin on top. The result is callable through its
`.parse()` method:

```js
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'

const j = new Tabnas().use(jsonic).use(Jsonc)

j.parse('{"a":1}')   // => { a: 1 }
```

Ordinary JSON parses exactly as you expect. Objects become objects,
arrays become arrays, and the scalar literals (`"string"`, numbers,
`true`/`false`/`null`) come back as native values.

## 3. Add comments

The reason to reach for JSONC is comments. Both line (`//`) and block
(`/* */`) comments are allowed, anywhere whitespace is — including
between a key and its value:

```js
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'

const j = new Tabnas().use(jsonic).use(Jsonc)

j.parse('{ "foo": /*hello*/true }')   // => { foo: true }
j.parse('1.2E-3 // comment')          // => 0.0012
```

A document that is *only* comments and whitespace parses to nothing:

```js
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'

const j = new Tabnas().use(jsonic).use(Jsonc)

j.parse('// just a comment')   // => undefined
```

## 4. Allow trailing commas

By default a trailing comma before `}` or `]` is a syntax error, just
like strict JSON. Pass `{ allowTrailingComma: true }` when you install
the plugin to permit it — handy for hand-edited config files:

```js
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'

const j = new Tabnas().use(jsonic).use(Jsonc, { allowTrailingComma: true })

j.parse('{ "hello": [], }')   // => { hello: [] }
j.parse('[ 1, 2, ]')          // => [1, 2]
```

The option is set once, at install time. The instance is reusable: call
`j.parse(...)` as many times as you like.

## 5. Catch an error

When the input cannot be parsed, the parser throws. Catch the error and
read its fields:

```js
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'

const j = new Tabnas().use(jsonic).use(Jsonc)

try {
  j.parse('"abc')              // a string that is never closed
} catch (err) {
  err.code                     // => 'unterminated_string'
  err.lineNumber               // => 1
  err.columnNumber             // => 1
  // err.message is a formatted, multi-line report with source context
}
```

The structured fields (`code`, `lineNumber`, `columnNumber`) are for
your code to branch on; `err.message` is a human-readable report you can
show a user.

## Where to go next

- [How-to guide](guide.md) — focused recipes for individual tasks.
- [Reference](reference.md) — the public API, every option, and the
  accepted syntax.
- [Concepts](concepts.md) — how the plugin works on the engine, and why.
