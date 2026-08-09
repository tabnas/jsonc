/* Copyright (c) 2021-2025 Richard Rodger and other contributors, MIT License */

// Uses the nst/JSONTestSuite corpus (Copyright (c) 2016 Nicolas Seriot,
// MIT License) vendored at test/JSONTestSuite/. The upstream LICENSE is
// kept in place; see also THIRD_PARTY_NOTICES.md.

// Runs the nst/JSONTestSuite (RFC 8259) against the jsonc plugin in all
// three option modes. Each file in test_parsing/ is classified by prefix:
//   y_*  must parse successfully (in every mode — JSONC is a JSON superset)
//   n_*  must be rejected, except the pinned per-mode allowlists
//   i_*  implementation-defined — verdict pinned, not merely counted
//
// The allowlists live in test/known-lenient.json and are read by BOTH this
// file and go/jsontestsuite_test.go, so a TS/Go divergence on any pinned case
// surfaces as a failure in one runtime instead of as silence. They are pinned
// exactly, so the test fails if a lenience is gained or lost. Update them
// deliberately when behaviour genuinely changes; do not re-pin to silence a
// red run.
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

// The shared cross-runtime pin. Keys ending in `-note` / `$`-prefixed are
// prose for the reader and are not case names.
const PIN_FILE = join(__dirname, '..', '..', 'test', 'known-lenient.json')
const PIN = JSON.parse(readFileSync(PIN_FILE, 'utf8'))

// n_* cases jsonic intentionally accepts that strict RFC 8259 rejects: number
// relaxations (leading zero, bare `+`, trailing `.`), unquoted map keys, and
// whitespace-only input (which jsonc resolves to `undefined` via its `#ZZ`
// alt rather than erroring).
const LENIENT_STRICT = Object.keys(PIN.strict)

// With comments enabled (the jsonc default) three more n_* files become legal
// JSONC: they are only invalid because they contain a `//` or `/* */` comment.
const LENIENT_COMMENTS = Object.keys(PIN.comments)

// With allowTrailingComma four more become legal JSONC: they are only invalid
// because of a trailing comma in an object or array.
const LENIENT_TRAILING_COMMA = Object.keys(PIN.trailingComma)

// The exact set of implementation-defined files jsonc accepts.
const I_ACCEPTED: string[] = PIN.implementationDefinedAccepted

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

  // The pin is only worth anything if every entry names a real corpus file and
  // carries a written reason. A pin that has drifted off the corpus, or that
  // records a lenience nobody justified, is an allowlist pretending to be a
  // measurement.
  test('known-lenient pin is intact', () => {
    const named = [
      ...Object.entries(PIN.strict as Record<string, string>),
      ...Object.entries(PIN.comments as Record<string, string>),
      ...Object.entries(PIN.trailingComma as Record<string, string>),
    ]
    const corpus = new Set(files)
    const missing = named.filter(([f]) => !corpus.has(f)).map(([f]) => f)
    assert.deepEqual(missing, [], 'pinned files that are not in the corpus')

    const unreasoned = named.filter(([, why]) => 20 >= why.length).map(([f]) => f)
    assert.deepEqual(unreasoned, [], 'pinned files with no written reason')

    const iMissing = I_ACCEPTED.filter((f) => !corpus.has(f))
    assert.deepEqual(iMissing, [], 'pinned i_* files that are not in the corpus')

    // Sizes pinned so a set cannot be quietly grown.
    assert.strictEqual(LENIENT_STRICT.length, 15)
    assert.strictEqual(LENIENT_COMMENTS.length, 3)
    assert.strictEqual(LENIENT_TRAILING_COMMA.length, 4)
    assert.strictEqual(I_ACCEPTED.length, 31)
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

      // RFC 8259 leaves these to the implementation, so neither verdict is
      // wrong — but an unrecorded verdict is. This used to classify every
      // i_* file and then assert only that 35 results existed, discarding
      // the verdicts: it could not fail however the parser behaved. The
      // accepted set is now pinned exactly, in every mode.
      test('i_* implementation-defined verdicts match the pin', () => {
        const accepted: string[] = []
        for (const f of files.filter((x) => x.startsWith('i_'))) {
          const src = readFileSync(join(SUITE_DIR, f), 'utf8')
          try {
            parse(src)
            accepted.push(f)
          } catch {
            // rejected
          }
        }
        assert.deepEqual(
          accepted.sort(),
          [...I_ACCEPTED].sort(),
          'i_* accepted set diverged from test/known-lenient.json',
        )
      })
    })
  }
})
