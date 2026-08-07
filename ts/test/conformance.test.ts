/* Copyright (c) 2026 Richard Rodger and other contributors, MIT License */

// JSONC conformance over the derived corpus at `test/vendor/corpus.json`.
//
// The corpus is NOT in this repository. It is regenerated from two upstreams
// pinned to commit SHAs by `scripts/fetch-conformance-suites.sh`:
//   - microsoft/node-jsonc-parser @ 3c9b4203... (v3.3.1) — the VS Code JSONC
//     reference implementation; supplies hand-written assertions from its own
//     src/test/json.test.ts and acts as the oracle for everything else.
//   - nst/JSONTestSuite @ 1ef36fa... — the RFC 8259 corpus.
//
// `go/conformance_test.go` runs the SAME corpus, so both runtimes are held to
// one external standard rather than to each other.
//
// This suite exercises BOTH halves and both are load-bearing:
//   - a valid case must parse AND produce the reference's value. "It did not
//     throw" is not enough.
//   - an invalid case must be REJECTED with an error.
//
// IT NEVER SKIPS. If the corpus is missing the suite FAILS with instructions.
// A conformance test that quietly does not run is worse than no test at all.
//
// THIS SUITE IS EXPECTED TO BE RED. It is a measuring instrument, not a
// target. Do not add a skip list, do not narrow the corpus, and do not weaken
// an assertion to raise the number. Fix the parser or leave it failing.

import { describe, test } from 'node:test'
import assert from 'node:assert'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '../dist/jsonc.js'

type Case = {
  name: string
  source: string
  origin: 'upstream-assertion' | 'reference-oracle' | 'leniency-probe'
  input: string
  options: Record<string, any> | null
  valid: boolean
  value?: any
}

// At runtime this file is loaded from `dist-test/`, so hop up one level to
// reach the fetched corpus in the repo root.
const corpusFile = join(__dirname, '..', '..', 'test', 'vendor', 'corpus.json')

const MISSING =
  `JSONC conformance corpus not found at ${corpusFile}.\n` +
  `The corpus is third-party and is deliberately NOT committed.\n` +
  `Fetch it (pinned commit SHAs, idempotent):\n` +
  `    scripts/fetch-conformance-suites.sh\n` +
  `This test FAILS rather than skips: a conformance run that silently does\n` +
  `not happen is the exact defect this suite exists to prevent.`

if (!existsSync(corpusFile)) {
  describe('jsonc conformance (node-jsonc-parser corpus)', () => {
    test('conformance corpus must be present', () => {
      assert.fail(MISSING)
    })
  })
} else {
  const corpus = JSON.parse(readFileSync(corpusFile, 'utf8')) as {
    upstream: Record<string, any>
    cases: Case[]
  }
  const cases = corpus.cases

  // Building a Tabnas instance is expensive (~18ms), so share one per distinct
  // option set. The plugin holds no per-parse state.
  const instances = new Map<string, any>()
  function parserFor(options: Record<string, any> | null) {
    const key = JSON.stringify(options ?? {})
    let j = instances.get(key)
    if (undefined === j) {
      j = new Tabnas().use(jsonic).use(Jsonc, options ?? {})
      instances.set(key, j)
    }
    return j
  }

  function label(s: string): string {
    const one = JSON.stringify(s)
    return 60 < one.length ? one.slice(0, 57) + '...' : one
  }

  // One outcome record per case, so the summary reports the true dial reading
  // rather than "the first assertion that blew up".
  type Outcome = { c: Case; ok: boolean; why: string }

  function run(c: Case): Outcome {
    const j = parserFor(c.options)
    let got: any
    let threw: any = null
    try {
      got = j.parse(c.input)
    } catch (e: any) {
      threw = e
    }

    if (!c.valid) {
      return threw
        ? { c, ok: true, why: '' }
        : { c, ok: false, why: `accepted an invalid document; got ${JSON.stringify(got)}` }
    }

    if (threw) {
      return { c, ok: false, why: `rejected a valid document: ${threw?.code || threw?.message}` }
    }

    // Round-trip through JSON so null-prototype maps / OrderedMap wrappers and
    // numeric types compare structurally against the reference's value.
    const norm = undefined === got ? undefined : JSON.parse(JSON.stringify(got))
    const want = c.value
    try {
      assert.deepStrictEqual(norm, want)
    } catch {
      return { c, ok: false, why: `wrong value: got ${JSON.stringify(norm)}, want ${JSON.stringify(want)}` }
    }
    return { c, ok: true, why: '' }
  }

  const outcomes = cases.map(run)

  function tally(pred: (c: Case) => boolean) {
    const sel = outcomes.filter((o) => pred(o.c))
    return { pass: sel.filter((o) => o.ok).length, total: sel.length }
  }

  const valid = tally((c) => c.valid)
  const invalid = tally((c) => !c.valid)
  const upstream = tally((c) => 'upstream-assertion' === c.origin)
  const leniency = tally((c) => 'leniency-probe' === c.origin)

  const pct = (t: { pass: number; total: number }) =>
    0 === t.total ? 'n/a' : ((100 * t.pass) / t.total).toFixed(1) + '%'

  console.log(
    `[jsonc conformance / TS] corpus=${cases.length}` +
    `  valid-accepted-with-correct-value ${valid.pass}/${valid.total} (${pct(valid)})` +
    `  invalid-rejected ${invalid.pass}/${invalid.total} (${pct(invalid)})` +
    `  upstream-authored subset ${upstream.pass}/${upstream.total} (${pct(upstream)})` +
    `  base-grammar leniency probe ${leniency.pass}/${leniency.total} (${pct(leniency)})`
  )

  describe('jsonc conformance (node-jsonc-parser corpus)', () => {
    // Pinned exactly, so the corpus cannot be quietly narrowed to raise the
    // pass rate. Regenerating it legitimately (a new upstream release) changes
    // these numbers, and that change has to be made deliberately here.
    test('corpus is present and intact', () => {
      assert.strictEqual(cases.length, 491, 'corpus size changed')
      assert.ok(0 < valid.total && 0 < invalid.total, 'corpus must exercise both halves')
      assert.strictEqual(
        cases.filter((c) => 'upstream-assertion' === c.origin).length, 48,
        'the hand-written upstream assertion subset changed size')
      assert.strictEqual(
        cases.filter((c) => c.name.startsWith('JSONTestSuite:')).length, 318,
        'the JSONTestSuite subset changed size')
      assert.strictEqual(
        cases.filter((c) => 'leniency-probe' === c.origin).length, 35,
        'the base-grammar leniency probe changed size')
    })

    describe('valid documents parse to the reference value', () => {
      for (const o of outcomes.filter((x) => x.c.valid)) {
        test(`${o.c.name}: ${label(o.c.input)}`, () => {
          assert.ok(o.ok, `${o.c.source}\n  input: ${JSON.stringify(o.c.input)}\n  ${o.why}`)
        })
      }
    })

    describe('invalid documents are rejected', () => {
      for (const o of outcomes.filter((x) => !x.c.valid)) {
        test(`${o.c.name}: ${label(o.c.input)}`, () => {
          assert.ok(o.ok, `${o.c.source}\n  input: ${JSON.stringify(o.c.input)}\n  ${o.why}`)
        })
      }
    })
  })
}
