# @tabnas/jsonc

A JSONC (JSON-with-comments) grammar plugin for the
[tabnas](https://github.com/tabnas/parser) parser. It teaches the
[jsonic](https://github.com/tabnas/jsonic) relaxed-JSON grammar to parse
[JSONC](https://github.com/microsoft/node-jsonc-parser): standard JSON
plus single-line (`//`) and block (`/* */`) comments, with optional
trailing commas.

[![npm version](https://img.shields.io/npm/v/@tabnas/jsonc.svg)](https://npmjs.com/package/@tabnas/jsonc)
[![build](https://github.com/tabnas/jsonc/actions/workflows/build.yml/badge.svg)](https://github.com/tabnas/jsonc/actions/workflows/build.yml)

| ![Voxgig](https://www.voxgig.com/res/img/vgt01r.png) | This open source module is sponsored and supported by [Voxgig](https://www.voxgig.com). |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |

## Install

`@tabnas/jsonc` is a plugin; install it alongside the engine and the base
grammar:

```bash
npm install @tabnas/parser @tabnas/jsonic @tabnas/jsonc
```

## Example

```js
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'

const j = new Tabnas().use(jsonic).use(Jsonc)

j.parse('{ "name": "app", /* version */ "version": "1.0" }')
// => { name: 'app', version: '1.0' }
```

Enable trailing commas with an option at install time:

```js
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '@tabnas/jsonc'

const j = new Tabnas().use(jsonic).use(Jsonc, { allowTrailingComma: true })
j.parse('{ "debug": true, "verbose": false, }')
// => { debug: true, verbose: false }
```

## Documentation

The docs follow the four [Diátaxis](https://diataxis.fr) quadrants:

- [Tutorial](doc/tutorial.md) — a guided first parse (learning).
- [How-to guide](doc/guide.md) — task recipes (install as a plugin, set
  options, handle errors, extend).
- [Reference](doc/reference.md) — the public API, every option, and the
  accepted syntax.
- [Concepts](doc/concepts.md) — how the plugin works on the engine, and
  why.

## Grammar diagram

The installed grammar as a railroad/syntax diagram, generated from the
live grammar with
[`@tabnas/railroad`](https://github.com/tabnas/railroad):

![jsonc grammar railroad diagram](doc/grammar.svg)

ASCII version: [`doc/grammar.txt`](doc/grammar.txt). The grammar is
defined in the repository-root `jsonc-grammar.jsonic` and embedded into
`src/jsonc.ts` (and the Go port) via `embed-grammar.js`.

## Acknowledgments

Conformance testing uses third-party corpora under MIT License:

- [nst/JSONTestSuite](https://github.com/nst/JSONTestSuite) by Nicolas
  Seriot — vendored at `test/JSONTestSuite/`.
- [microsoft/node-jsonc-parser](https://github.com/microsoft/node-jsonc-parser) —
  parse-level test cases ported into `test/jsonc.test.ts`.

See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for details.

## License

MIT. Copyright (c) 2021-2025 Richard Rodger and contributors.
