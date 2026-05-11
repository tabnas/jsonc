/* Copyright (c) 2021-2025 Richard Rodger and other contributors, MIT License */

// Uses the nst/JSONTestSuite corpus (Copyright (c) 2016 Nicolas Seriot,
// MIT License) vendored at test/JSONTestSuite/. The upstream LICENSE is
// kept in place; see also THIRD_PARTY_NOTICES.md.

// Runs the nst/JSONTestSuite (RFC 8259) against the jsonc plugin in strict
// mode (disallowComments: true, no trailing commas). Each file in
// test_parsing/ is classified by prefix:
//   y_*  must parse successfully
//   n_*  must be rejected (known-lenient cases pinned in N_KNOWN_LENIENT)
//   i_*  implementation-defined (recorded only)
//
// Known-lenient n_* entries reflect intentional jsonic relaxations vs. strict
// RFC 8259 (e.g. leading zeros, unquoted keys). They are pinned so the set
// is caught if it grows or shrinks.

import { test, describe } from 'node:test'
import assert from 'node:assert'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { Jsonic } from 'jsonic'
import { Jsonc } from '../dist/jsonc.js'

const SUITE_DIR = join(__dirname, '..', '..', 'test', 'JSONTestSuite', 'test_parsing')

const j = Jsonic.make().use(Jsonc, { disallowComments: true })

const parse = (src: string) => j(src)

const files = existsSync(SUITE_DIR)
  ? readdirSync(SUITE_DIR).filter((f) => f.endsWith('.json')).sort()
  : []

// Cases jsonic intentionally accepts that RFC 8259 requires rejecting.
const N_KNOWN_LENIENT = new Set<string>([
  'n_array_comma_after_close.json',
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
  'n_object_single_quote.json',
  'n_single_space.json',
  'n_string_escape_x.json',
  'n_string_single_quote.json',
  'n_structure_object_with_trailing_garbage.json',
])

describe('JSONTestSuite (RFC 8259)', () => {
  if (0 === files.length) {
    test('suite unavailable', () => {
      console.warn(`JSONTestSuite not found at ${SUITE_DIR} — skipping.`)
    })
    return
  }

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
    assert.deepEqual(fails, [], `y_* files that failed to parse:\n${fails.map((x) => `  ${x.file}: ${x.err}`).join('\n')}`)
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
      const isLenient = N_KNOWN_LENIENT.has(f)
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
    assert.ok(results.length > 0, 'expected at least one i_* file')
  })
})
