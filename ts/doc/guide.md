# How-to guide

Short, task-focused recipes. Each is self-contained and assumes you have
the three packages installed (see the [tutorial](tutorial.md) for the
basics). For full signatures and the option table, see the
[reference](reference.md).

Every recipe starts from the same imports:

```js
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'
```

## Install the plugin

`Jsonc` is a plugin. Build a `Tabnas` engine, install the `jsonic` base
grammar first, then install `Jsonc`. Order matters — `Jsonc` extends the
rules `jsonic` provides:

```js
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'

const j = new Tabnas().use(jsonic).use(Jsonc)

j.parse('{ "name": "app", /* v */ "version": "1.0" }')
// => { name: 'app', version: '1.0' }
```

Build the instance **once** and reuse it for many parses. Constructing
the grammar is the expensive step; `j.parse()` on an existing instance is
cheap.

## Allow trailing commas

Pass `allowTrailingComma: true` at install time. A single trailing comma
before `}` or `]` is then accepted in both objects and arrays:

```js
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'

const j = new Tabnas().use(jsonic).use(Jsonc, { allowTrailingComma: true })

j.parse('{ "hello": [], "world": {}, }')   // => { hello: [], world: {} }
j.parse('[ 1, 2, ]')                       // => [1, 2]
```

Without this option, the same inputs throw. Note this permits *one*
trailing comma, not leading or doubled commas — `[ ,1 ]` and `[ 1,, 2 ]`
are always errors.

## Parse strict JSON (reject comments)

Pass `disallowComments: true` to turn off comment lexing. The parser then
rejects both `//` and `/* */`, behaving like a strict-JSON reader:

```js
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'

const j = new Tabnas().use(jsonic).use(Jsonc, { disallowComments: true })

j.parse('[ 1, 2, null, "foo" ]')   // => [1, 2, null, 'foo']

// j.parse('{ "foo": /*comment*/ true }') now throws
let threw = false
try { j.parse('{ "foo": /*comment*/ true }') } catch (e) { threw = true }
threw   // => true
```

## Handle parse errors

A failed parse throws a `TabnasError`. Catch it and read its fields:

```js
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'

const j = new Tabnas().use(jsonic).use(Jsonc)

try {
  j.parse('{ "bad": }')        // missing value
} catch (err) {
  err.code                     // a short code string, e.g. 'unexpected'
  err.lineNumber               // 1-based line number
  err.columnNumber             // 1-based column number
  // err.message: formatted multi-line report with source context
}
```

Common codes you will see: `unexpected` (no rule matched here),
`unterminated_string` (a `"` is never closed), `unterminated_comment` (a
`/* */` block is never closed), and `unprintable` (a raw control
character inside a string).

## Parse a config file

JSONC is the format VS Code uses for `tsconfig.json`, `settings.json`,
and similar files — which often carry comments and trailing commas. Read
the file and parse its text:

```js ignore
import { readFileSync } from 'node:fs'
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'

const j = new Tabnas().use(jsonic).use(Jsonc, { allowTrailingComma: true })
const config = j.parse(readFileSync('tsconfig.json', 'utf8'))
```

## Layer your own grammar on top

`Jsonc` is just one plugin in the `.use(...)` chain. You can install
additional plugins after it; each extends the same engine instance. The
base grammar must come first, then `Jsonc`, then anything that builds on
JSONC:

```js ignore
const j = new Tabnas()
  .use(jsonic)          // base relaxed-JSON grammar
  .use(Jsonc)           // JSONC: comments + optional trailing commas
  .use(myPlugin)        // your own rule/option extensions
```

See [Concepts](concepts.md) for what `Jsonc` actually installs (a handful
of alternates on jsonic's `val`, `pair`, and `elem` rules) before you
extend it.
