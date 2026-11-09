/* Copyright (c) 2026 Richard Rodger and other contributors, MIT License */

// A parse from a reader (`tn.parseReader`, admin ADR-30 and ADR-33).
//
// `make()` builds the parser whole, as `new Tabnas().use(jsonic).use(Jsonc,
// options)` builds it, and declares `lex.window` on it, so that a reader is
// read a window at a time. Every token of the grammar, jsonic's base
// included, is cut by the engine's own matchers, and neither plugin's
// actions read the source. These tests hold it to that: `make()` declares
// the window and parses as that composition does; every row of the shared
// fixtures, under its `opts`, and every document of the JSONTestSuite corpus
// in each of the three modes parses the same from a reader, in pieces of 1,
// 3 and 64 bytes, under windows of a few UTF-16 units and the engine's own,
// as from its text, but for the corpus documents that are not UTF-8, which
// a reader refuses as `unreadable`; and a long document and tokens longer
// than the window parse the same too.

import { test, describe } from 'node:test'
import assert from 'node:assert'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inspect } from 'node:util'

import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { findSpecDir, loadSpec } from '@tabnas/support'

import { Jsonc, make } from '../dist/jsonc.js'
import type { JsoncOptions } from '../dist/jsonc.js'

import { unescapeJsonc } from './unescape.js'

const SPEC = findSpecDir(__dirname)
const SUITE = join(__dirname, '..', '..', 'test', 'JSONTestSuite', 'test_parsing')

type Reader = { read(buf: Uint8Array): number }
type Sizes = { margin: number; block: number; chunk: number }
type Seen = { value?: unknown; error?: string }

// A reader that hands its bytes over at most `size` at a time.
function pieces(bytes: Uint8Array, size: number): Reader {
  let at = 0
  return {
    read(buf: Uint8Array): number {
      const n = Math.min(size, buf.length, bytes.length - at)
      buf.set(bytes.subarray(at, at + n))
      at += n
      return n
    },
  }
}

// What a parse shows: its value, or its error's code, position, row,
// column and token text. An error's excerpt is left out: a parse from a
// reader shows a long line only as far back as the window reaches
// (tabnas/parser DIVERGENCE.md), the one difference allowed.
function seen(parse: () => unknown): Seen {
  try {
    return { value: parse() }
  } catch (e: any) {
    if (null == e || 'function' !== typeof e.toJSON) {
      return { error: 'throw ' + (e && e.name) + ' ' + (e && e.message) }
    }
    const d = e.toJSON()
    return {
      error:
        d.code + ' at ' + d.pos + ' ' + d.row + ':' + d.col + ' ' +
        JSON.stringify(d.token.src),
    }
  }
}

const show = (o: Seen): string =>
  undefined !== o.error ? 'error ' + o.error : 'value ' + inspect(o.value, { depth: 4 })

function same(a: Seen, b: Seen): boolean {
  if (a.error !== b.error) return false
  try {
    assert.deepStrictEqual(a.value, b.value)
    return true
  } catch (e) {
    return false
  }
}

// The pieces a reader hands its bytes over in, and the windows (margin and
// block) it is read under besides the engine's own: a few units, so that
// every matcher meets the window's edge.
const PIECES = [1, 3, 64]
const WINDOWS = [[1, 1], [3, 2], [64, 64]]

// `text` parsed by `tn` whole, and from a reader in every pieces size,
// under the engine's window and each of WINDOWS: how many reader parses
// were compared. A difference is pushed onto `failures`.
//
// A document over 512 bytes is read once, in pieces of 4096, under the
// engine's window. Those are three of the corpus, each nested 500 levels
// deep or more, whose every parse is slow for the nesting, not the window;
// their tokens are one character long.
function sameFromReader(tn: Tabnas, at: string, text: string, failures: string[]): number {
  const whole = seen(() => tn.parse(text))
  const bytes = Buffer.from(text, 'utf8')
  const anyTn = tn as any
  const large = 512 < bytes.length
  let compared = 0
  for (const size of large ? [4096] : PIECES) {
    const reads: [string, () => unknown][] = [['', () => anyTn.parseReader(pieces(bytes, size))]]
    for (const [margin, block] of large ? [] : WINDOWS) {
      const sizes: Sizes = { margin, block, chunk: size }
      reads.push([
        ', margin ' + margin + ', block ' + block,
        () => anyTn.parseReaderWithSizes(pieces(bytes, size), sizes),
      ])
    }
    for (const [how, parse] of reads) {
      const read = seen(parse)
      compared++
      if (!same(read, whole)) {
        failures.push(
          at + ': ' + JSON.stringify(text.slice(0, 80)) + ' from a reader in pieces of ' +
          size + how + '\n  whole:  ' + show(whole) + '\n  reader: ' + show(read),
        )
      }
    }
  }
  return compared
}

const optionsOf = (cell: string): JsoncOptions => ('' === cell.trim() ? {} : JSON.parse(cell))

// The three modes the corpus is read in, as jsontestsuite.test.ts reads it.
const MODES: [string, JsoncOptions][] = [
  ['strict', { disallowComments: true }],
  ['comments', {}],
  ['trailing-comma', { allowTrailingComma: true }],
]

describe('window', () => {
  test('make-declares-the-window', () => {
    const tn = make() as any
    assert.equal(tn.internal().config.lex.window, true)
    // The plugin alone declares nothing: a host may install it beneath
    // matchers of its own.
    const composed = new Tabnas().use(jsonic).use(Jsonc, {}) as any
    assert.ok(!composed.internal().config.lex.window)
  })

  test('make-parses-as-the-composition-does', () => {
    // Every fixture row, whole, through `make(opts)` and through
    // `new Tabnas().use(jsonic).use(Jsonc, opts)`, which dmog composed.
    let compared = 0
    const failures: string[] = []
    for (const file of readdirSync(SPEC).filter((f) => f.endsWith('.tsv')).sort()) {
      for (const row of loadSpec(join(SPEC, file)).rows) {
        const options = optionsOf(row.named('opts'))
        const input = unescapeJsonc(row.named('input'))
        const made = seen(() => make(options).parse(input))
        const composed = seen(() => new Tabnas().use(jsonic).use(Jsonc, options).parse(input))
        compared++
        if (!same(made, composed)) {
          failures.push(file + ':' + row.line + '\n  make:     ' + show(made) +
            '\n  composed: ' + show(composed))
        }
      }
    }
    assert.ok(100 < compared, '' + compared)
    assert.deepEqual(failures, [])
  })

  test('every-row-parses-the-same-from-a-reader', () => {
    const files = readdirSync(SPEC).filter((f) => f.endsWith('.tsv')).sort()
    let compared = 0
    const failures: string[] = []
    files.forEach((file, index) => {
      for (const row of loadSpec(join(SPEC, file)).rows) {
        compared += sameFromReader(
          make(optionsOf(row.named('opts'))),
          file + ':' + row.line,
          unescapeJsonc(row.named('input')),
          failures,
        )
      }
      console.log('window fixtures: ' + (index + 1) + ' of ' + files.length + ' files (' +
        Math.floor(((index + 1) * 100) / files.length) + '%), ' + compared + ' reader parses')
    })
    assert.ok(1000 < compared, '' + compared)
    assert.deepEqual(failures, [])
  })

  test('the-corpus-parses-the-same-from-a-reader', () => {
    const files = readdirSync(SUITE).filter((f) => f.endsWith('.json')).sort()
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let compared = 0
    let refused = 0
    const failures: string[] = []
    MODES.forEach(([mode, options], index) => {
      const tn = make(options)
      for (const file of files) {
        const bytes = readFileSync(join(SUITE, file))
        let text: string
        try {
          text = decoder.decode(bytes)
        } catch (e) {
          // Not UTF-8: a reader refuses it, where a parse of a decoded
          // string has no such bytes to refuse.
          const read = seen(() => (tn as any).parseReader(pieces(bytes, 3)))
          refused++
          if (undefined === read.error || !read.error.startsWith('unreadable ')) {
            failures.push(mode + ' ' + file + ': from a reader ' + show(read) + ', not unreadable')
          }
          continue
        }
        compared += sameFromReader(tn, mode + ' ' + file, text, failures)
      }
      console.log('window corpus: ' + (index + 1) + ' of ' + MODES.length + ' modes (' +
        Math.floor(((index + 1) * 100) / MODES.length) + '%), ' + compared + ' reader parses')
    })
    assert.equal(refused, 3 * 25)
    assert.ok(10000 < compared, '' + compared)
    assert.deepEqual(failures, [])
  })

  test('tokens-longer-than-the-window-parse-the-same-from-a-reader', () => {
    // The engine's window reaches 64 KiB past the cursor before each
    // token: a token longer than that meets its edge under the engine's
    // own sizes.
    const long = (64 << 10) + 2048
    const docs = [
      '["' + 's'.repeat(long) + '\\u0041"]',
      '["' + '\\n'.repeat(long / 2) + '"]',
      '[1' + '0'.repeat(long) + ']',
      '[-1.' + '5'.repeat(long) + 'e3, 2]',
      '[1, // ' + 'c'.repeat(long) + '\n2]',
      '[1, /* ' + 'b\n'.repeat(long / 2) + ' */ 2]',
      '[1,' + ' '.repeat(long) + '2]',
      '[1,' + '\n'.repeat(long) + '2]',
      '["' + 'a'.repeat(long) + '\u0001"]',
      '["' + 'a'.repeat(long),
      '[1, /* ' + 'u'.repeat(long),
    ]
    const failures: string[] = []
    for (const [mode, options] of MODES) {
      const tn = make(options) as any
      docs.forEach((doc, n) => {
        const whole = seen(() => tn.parse(doc))
        for (const size of [4096, (64 << 10) + 3]) {
          const read = seen(() => tn.parseReader(pieces(Buffer.from(doc, 'utf8'), size)))
          if (!same(read, whole)) {
            failures.push(mode + ' document ' + n + ' in pieces of ' + size + ': whole ' +
              show(whole).slice(0, 200) + ', reader ' + show(read).slice(0, 200))
          }
        }
      })
    }
    assert.deepEqual(failures, [])
  })

  test('a-long-document-parses-the-same-from-a-reader', () => {
    // From a reader in pieces of 4 KiB, under the engine's window and
    // under one of 256 units, which moves on thousands of times; with an
    // error at the end too, which the reader places where the whole text
    // does.
    const records: string[] = []
    for (let i = 0; i < 8000; i++) {
      records.push('{"id": ' + i + ', "name": "ñ' + i + '\\u00e9" /* note ' + i +
        ' */, "tags": ["a", "b"], "n": -1.5e3}' + (i < 7999 ? ',' : '') + ' // row ' + i)
    }
    const body = '// records\n[\n' + records.join('\n')
    const text = body + '\n]\n'
    assert.ok(512 << 10 < text.length, '' + text.length)
    const broken = body + '\n, "tail\u0001"\n]\n'
    const tn = make() as any
    ;[text, broken].forEach((doc, n) => {
      const whole = seen(() => tn.parse(doc))
      assert.equal(undefined === whole.error, 0 === n, show(whole).slice(0, 200))
      for (const sizes of [undefined, { margin: 256, block: 256, chunk: 4096 }]) {
        const bytes = Buffer.from(doc, 'utf8')
        const read = seen(() =>
          undefined === sizes
            ? tn.parseReader(pieces(bytes, 4096))
            : tn.parseReaderWithSizes(pieces(bytes, 4096), sizes),
        )
        assert.ok(same(read, whole), show(read).slice(0, 200))
      }
      console.log('window long document: ' + (n + 1) + ' of 2 (' + (n + 1) * 50 + '%)')
    })
  })
})
