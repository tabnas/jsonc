/* Copyright (c) 2025 Richard Rodger and other contributors, MIT License */

// Cross-runtime conformance, driven by the shared `test/spec/*.tsv` fixtures
// at the repo root (see ../../test/AGENTS.md).
//
// The fixture loader, the escape codec, the `ERROR:<code>` contract and the
// row loop all come from @tabnas/support, whose Go half `go/parity_test.go`
// uses to run the SAME files — so the two implementations cannot drift
// without one of them going red, and neither can the two loaders.
//
// What is left here is only what is specific to jsonc.

import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { findSpecDir, makeRunner, parseExpect } from '@tabnas/support'

import { Jsonc } from '../dist/jsonc.js'

// The one thing this repo does not take from @tabnas/support: its own
// escape codec, because jsonc's fixtures need a sixth escape.
//
// A raw NUL inside a string must be rejected as `unprintable`, and a NUL
// cannot be written literally in a .tsv — git would call the file binary.
// The shared codec passes `\0` through unchanged on purpose (a fixture has
// to be able to carry a literal backslash-zero; json5's `\\0` rows rely on
// exactly that), so decoding it has to happen HERE, in one pass over the
// RAW cell. Two passes cannot work: after the shared codec, `\0` from `\0`
// and `\0` from `\\0` are the same two characters.
//
// Kept byte-identical to `specUnescape` in go/parity_test.go.
function unescapeJsonc(s: string): string {
  if (!s.includes('\\')) return s
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '\\' && i + 1 < s.length) {
      const n = s[i + 1]
      if (n === 'n') { out += '\n'; i++; continue }
      if (n === 'r') { out += '\r'; i++; continue }
      if (n === 't') { out += '\t'; i++; continue }
      if (n === '0') { out += '\0'; i++; continue }
      if (n === '\\') { out += '\\'; i++; continue }
    }
    out += c
  }
  return out
}

makeRunner({
  // A fresh Tabnas per row: the `opts` column is per-case, and plugin
  // options must not leak from one row into the next.
  //
  // The runner's own decoding of the input column is bypassed — see
  // unescapeJsonc above — so the raw cell is read and decoded here.
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
  // .tsv runs it in both runtimes without touching either runner.
  .dir(findSpecDir(__dirname))
