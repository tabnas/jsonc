/* Copyright (c) 2021-2026 Richard Rodger and other contributors, MIT License */

// Runs nst/JSONTestSuite (the RFC 8259 corpus) against the jsonc plugin in
// strict mode (disallowComments: true, no trailing commas).
//
// The corpus is third-party and is NOT committed. It is fetched at a pinned
// commit SHA into the gitignored test/vendor/ by
// scripts/fetch-conformance-suites.sh. See THIRD_PARTY_NOTICES.md.
//
// Each file in test_parsing/ is classified by prefix:
//   y_*  must parse successfully
//   n_*  must be rejected, except for the leniencies pinned (with a written
//        reason each) in test/known-lenient.json
//   i_*  implementation-defined by RFC 8259 — checked against the JSONC
//        REFERENCE IMPLEMENTATION's verdict, recorded in test/vendor/corpus.json
//
// `go/jsontestsuite_test.go` runs the SAME corpus and the SAME pin file.
//
// IT NEVER SKIPS. If the corpus is missing the suite FAILS with instructions.

import { test, describe } from 'node:test'
import assert from 'node:assert'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '../dist/jsonc.js'

const REPO = join(__dirname, '..', '..')
const SUITE_DIR = join(REPO, 'test', 'vendor', 'JSONTestSuite', 'test_parsing')
const PIN_FILE = join(REPO, 'test', 'known-lenient.json')
const CORPUS_FILE = join(REPO, 'test', 'vendor', 'corpus.json')

const MISSING =
  `nst/JSONTestSuite corpus not found at ${SUITE_DIR}.\n` +
  `It is third-party and is deliberately NOT committed.\n` +
  `Fetch it (pinned commit SHA, idempotent):\n` +
  `    scripts/fetch-conformance-suites.sh\n` +
  `This test FAILS rather than skips: before 2026-08 this suite silently\n` +
  `skipped whenever the corpus was absent, so CI reported green while\n` +
  `measuring nothing. That must never be possible again.`

if (!existsSync(SUITE_DIR) || !existsSync(CORPUS_FILE)) {
  describe('JSONTestSuite (RFC 8259)', () => {
    test('RFC 8259 corpus must be present', () => {
      assert.fail(MISSING)
    })
  })
} else {
  const j = new Tabnas().use(jsonic).use(Jsonc, { disallowComments: true })
  const parse = (src: string) => j.parse(src)

  const files = readdirSync(SUITE_DIR).filter((f) => f.endsWith('.json')).sort()

  // Cases jsonic intentionally accepts that RFC 8259 requires rejecting.
  // Shared with the Go runtime; one written reason per entry.
  const pin = JSON.parse(readFileSync(PIN_FILE, 'utf8')) as {
    lenient: Record<string, string>
  }
  const N_KNOWN_LENIENT = new Set(Object.keys(pin.lenient))

  // The reference implementation's verdict for every JSONTestSuite file, as
  // recorded in the derived corpus. Used to decide the i_* (implementation-
  // defined) cases: RFC 8259 leaves them open, so "what does the JSONC
  // reference do" is the only meaningful standard.
  const corpus = JSON.parse(readFileSync(CORPUS_FILE, 'utf8')) as {
    cases: { name: string; valid: boolean }[]
  }
  const refVerdict = new Map<string, boolean>()
  for (const c of corpus.cases) {
    if (c.name.startsWith('JSONTestSuite:')) {
      refVerdict.set(c.name.slice('JSONTestSuite:'.length), c.valid)
    }
  }

  describe('JSONTestSuite (RFC 8259)', () => {
    test('corpus is present and intact', () => {
      assert.strictEqual(files.length, 318,
        `expected 318 test_parsing files, found ${files.length} — the corpus ` +
        `must not be narrowed. Re-run scripts/fetch-conformance-suites.sh.`)
      for (const prefix of ['y_', 'n_', 'i_']) {
        assert.ok(0 < files.filter((f) => f.startsWith(prefix)).length,
          `no ${prefix}* files — corpus is not intact`)
      }
      // Every pinned leniency must name a file that actually exists, so the
      // pin cannot rot into a set of no-op entries.
      for (const f of N_KNOWN_LENIENT) {
        assert.ok(files.includes(f), `pinned leniency names a missing file: ${f}`)
        assert.ok(0 < pin.lenient[f].trim().length, `pinned leniency ${f} has no reason`)
      }
    })

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

    // Previously this block computed a classification for every i_* file and
    // then asserted only `results.length > 0` — i.e. it asserted nothing about
    // behaviour at all. Each file is now held to the JSONC reference
    // implementation's verdict.
    test('i_* match the JSONC reference implementation', () => {
      const mismatches: string[] = []
      const undecided: string[] = []
      const iFiles = files.filter((x) => x.startsWith('i_'))
      for (const f of iFiles) {
        const want = refVerdict.get(f)
        if (undefined === want) { undecided.push(f); continue }
        const src = readFileSync(join(SUITE_DIR, f), 'utf8')
        let accepted = false
        try {
          parse(src)
          accepted = true
        } catch {
          // rejected
        }
        if (accepted !== want) {
          mismatches.push(`${f}: we ${accepted ? 'accept' : 'reject'}, reference ${want ? 'accepts' : 'rejects'}`)
        }
      }
      assert.deepEqual(undecided, [],
        `i_* files with no recorded reference verdict:\n  ${undecided.join('\n  ')}`)
      assert.ok(0 < iFiles.length, 'expected at least one i_* file')
      assert.deepEqual(mismatches, [],
        `i_* divergence from the JSONC reference implementation:\n  ${mismatches.join('\n  ')}`)
    })
  })
}
