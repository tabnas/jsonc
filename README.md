# @tabnas/jsonc

This plugin allows the Jsonic JSON parser to support JSONC syntax.

This repository contains:

| Path | Description |
|---|---|
| [`ts/`](ts/) | TypeScript / JavaScript implementation. |
| [`go/`](go/) | Go port. |

See [`ts/README.md`](ts/README.md) for usage.

## Grammar

The grammar is defined once in the top-level
[`jsonc-grammar.jsonic`](jsonc-grammar.jsonic) and embedded into both the
TypeScript ([`ts/src/jsonc.ts`](ts/src/jsonc.ts)) and Go
([`go/jsonc.go`](go/jsonc.go)) implementations by
[`ts/embed-grammar.js`](ts/embed-grammar.js) (run as part of `npm run build`).
Edit the `.jsonic` file, then re-embed — never edit the embedded copies by hand.

The grammar as a railroad/syntax diagram, generated from the live grammar
with [`@tabnas/railroad`](https://github.com/tabnas/railroad):

![jsonc grammar railroad diagram](ts/doc/grammar.svg)

ASCII version: [`ts/doc/grammar.txt`](ts/doc/grammar.txt).

## License

MIT. Copyright (c) Richard Rodger.
