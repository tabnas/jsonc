/* Copyright (c) 2021-2025 Richard Rodger and other contributors, MIT License */

// Uses the nst/JSONTestSuite corpus (Copyright (c) 2016 Nicolas Seriot,
// MIT License) vendored at test/JSONTestSuite/. The upstream LICENSE is
// kept in place; see also THIRD_PARTY_NOTICES.md.

// Runs the nst/JSONTestSuite (RFC 8259) against the jsonc plugin in all
// three option modes. Each file in test_parsing/ is classified by prefix:
//   y_*  must parse successfully (in every mode — JSONC is a JSON superset)
//   n_*  must be rejected, except the pinned per-mode allowlists below
//   i_*  implementation-defined (recorded only)
//
// The n_* allowlists are pinned exactly, so the test fails if a lenience is
// gained or lost. Update them deliberately when behaviour genuinely changes;
// do not re-pin to silence a red run.
//
// The suite is vendored in this repository, so it is always available. If it
// is missing the test FAILS rather than skipping — a conformance run that
// silently does not happen is worse than no conformance run at all.

import { test, describe } from 'node:test'
import assert from 'node:assert'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '../dist/jsonc.js'

const SUITE_DIR = join(__dirname, '..', '..', 'test', 'JSONTestSuite', 'test_parsing')

const files = existsSync(SUITE_DIR)
  ? readdirSync(SUITE_DIR).filter((f) => f.endsWith('.json')).sort()
  : []

// n_* cases jsonic intentionally accepts that strict RFC 8259 rejects: number
// relaxations (leading zero, bare `+`, trailing `.`), unquoted map keys, and
// whitespace-only input (which jsonc resolves to `undefined` via its `#ZZ`
// alt rather than erroring).
const LENIENT_STRICT = [
  'n_number_+1.json',
  'n_number_-01.json',
  'n_number_-2..json',
  'n_number_0.e1.json',
  'n_number_2.e+3.json',
  'n_number_2.e-3.json',
  'n_number_2.e3.json',
  'n_number_neg_int_starting_with_zero.json',
  'n_number_neg_real_without_int_part.json',
  'n_number_real_without_fractional_part.json',
  'n_number_with_leading_zero.json',
  'n_object_non_string_key.json',
  'n_object_non_string_key_but_huge_number_instead.json',
  'n_object_repeated_null_null.json',
  'n_single_space.json',
]

// With comments enabled (the jsonc default) three more n_* files become legal
// JSONC: they are only invalid because they contain a `//` or `/* */` comment.
const LENIENT_COMMENTS = [
  'n_object_trailing_comment.json',
  'n_object_trailing_comment_slash_open.json',
  'n_structure_object_with_comment.json',
]

// With allowTrailingComma four more become legal JSONC: they are only invalid
// because of a trailing comma in an object or array.
const LENIENT_TRAILING_COMMA = [
  'n_array_extra_comma.json',
  'n_array_number_and_comma.json',
  'n_object_lone_continuation_byte_in_key_and_trailing_comma.json',
  'n_object_trailing_comma.json',
]

const MODES: { name: string; options: any; lenient: Set<string> }[] = [
  {
    name: 'strict (disallowComments)',
    options: { disallowComments: true },
    lenient: new Set(LENIENT_STRICT),
  },
  {
    name: 'default (comments)',
    options: {},
    lenient: new Set([...LENIENT_STRICT, ...LENIENT_COMMENTS]),
  },
  {
    name: 'allowTrailingComma',
    options: { allowTrailingComma: true },
    lenient: new Set([...LENIENT_STRICT, ...LENIENT_COMMENTS, ...LENIENT_TRAILING_COMMA]),
  },
]

describe('JSONTestSuite (RFC 8259)', () => {
  test('suite is present and intact', () => {
    assert.ok(
      existsSync(SUITE_DIR),
      `JSONTestSuite not found at ${SUITE_DIR}. It is vendored in this repo; ` +
        `a missing corpus means the conformance claim is unverified.`,
    )
    assert.strictEqual(files.length, 318, 'JSONTestSuite test_parsing corpus size changed')
    assert.strictEqual(files.filter((f) => f.startsWith('y_')).length, 95)
    assert.strictEqual(files.filter((f) => f.startsWith('n_')).length, 188)
    assert.strictEqual(files.filter((f) => f.startsWith('i_')).length, 35)
  })

  for (const mode of MODES) {
    describe(mode.name, () => {
      const j = new Tabnas().use(jsonic).use(Jsonc, mode.options)
      const parse = (src: string) => j.parse(src)

      test('y_* accept', () => {
        const fails: { file: string; err: string }[] = []
        for (const f of files.filter((x) => x.startsWith('y_'))) {
          const src = readFileSync(join(SUITE_DIR, f), 'utf8')
          try {
            parse(src)
          } catch (e: any) {
            fails.push({ file: f, err: e?.code || e?.message || String(e) })
          }
        }
        assert.deepEqual(
          fails,
          [],
          `y_* files that failed to parse:\n${fails.map((x) => `  ${x.file}: ${x.err}`).join('\n')}`,
        )
      })

      test('n_* reject', () => {
        const unexpectedAccept: string[] = []
        const unexpectedReject: string[] = []
        for (const f of files.filter((x) => x.startsWith('n_'))) {
          const src = readFileSync(join(SUITE_DIR, f), 'utf8')
          let accepted = false
          try {
            parse(src)
            accepted = true
          } catch {
            // expected
          }
          const isLenient = mode.lenient.has(f)
          if (accepted && !isLenient) unexpectedAccept.push(f)
          if (!accepted && isLenient) unexpectedReject.push(f)
        }
        assert.deepEqual(
          { unexpectedAccept, unexpectedReject },
          { unexpectedAccept: [], unexpectedReject: [] },
          'n_* divergence from pinned allowlist',
        )
      })

      test('i_* implementation-defined', () => {
        const results: { file: string; accepted: boolean }[] = []
        for (const f of files.filter((x) => x.startsWith('i_'))) {
          const src = readFileSync(join(SUITE_DIR, f), 'utf8')
          try {
            parse(src)
            results.push({ file: f, accepted: true })
          } catch {
            results.push({ file: f, accepted: false })
          }
        }
        assert.strictEqual(results.length, 35, 'expected all i_* files to be classified')
      })
    })
  }
})
