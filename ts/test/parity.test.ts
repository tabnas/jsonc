/* Copyright (c) 2025 Richard Rodger and other contributors, MIT License */

// Cross-runtime conformance, driven by the shared `test/spec/*.tsv` fixtures
// at the repo root (see ../../test/AGENTS.md).
//
// The fixture loader, the escape codec, the `ERROR:<code>` contract and the
// row loop all come from @tabnas/support, whose Go and Rust halves
// `go/parity_test.go` and `rs/tests/parity_test.rs` use to run the SAME
// files — so the implementations cannot drift without one of them going
// red, and neither can the loaders.
//
// What is left here is only what is specific to jsonc.

import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { findSpecDir, makeRunner, parseExpect } from '@tabnas/support'

import { Jsonc } from '../dist/jsonc.js'

import { unescapeJsonc } from './unescape.js'

// The fixtures' own escape codec (see unescape.ts): jsonc's fixtures need
// a sixth escape, `\0`, which the shared codec passes through.

makeRunner({
  // A fresh Tabnas per row: the `opts` column is per-case, and plugin
  // options must not leak from one row into the next.
  //
  // The runner's own decoding of the input column is bypassed — see
  // unescapeJsonc in unescape.ts — so the raw cell is read and decoded here.
  parse: (_input, row) => {
    const input = unescapeJsonc(row.named('input'))
    const opts = row.named('opts')
    const tn = new Tabnas()
      .use(jsonic)
      .use(Jsonc, '' === opts.trim() ? {} : JSON.parse(opts))

    try {
      return tn.parse(input)
    }
    catch (err: any) {
      // A bare `ERROR` row is satisfied by ANY throw, so a broken harness
      // — a TypeError from this file, a SyntaxError from a malformed
      // `opts` cell — would read as a conformance result. It has before.
      //
      // Hand anything that is not a real parse failure back as a VALUE:
      // the row then fails, saying what actually went wrong, instead of
      // passing as a rejection the parser never made.
      if ('TabnasError' !== err?.constructor?.name) {
        return `NOT-A-PARSE-ERROR: ${err?.constructor?.name}: ${err?.message}`
      }
      throw err
    }
  },

  // Trivia-only input yields no value at all, which JSON cannot spell —
  // and which is a different result from a document whose value is null,
  // so a row that says `null` still must not be satisfied by it.
  parseExpected: (expected) =>
    'UNDEFINED' === expected ? undefined : parseExpect(expected),
})
  // `findSpecDir` walks up from this file — `dist-test/` at runtime — to the
  // repo root's `test/spec`, so moving the suite does not mean recounting
  // `..` hops. `dir` then auto-discovers every fixture in it, so adding a
  // .tsv runs it in every runtime without touching any runner.
  .dir(findSpecDir(__dirname))
