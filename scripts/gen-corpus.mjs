/* Copyright (c) 2026 Richard Rodger and other contributors, MIT License */

// Derives test/vendor/corpus.json — the JSONC conformance corpus that BOTH
// runtimes run. Called by scripts/fetch-conformance-suites.sh; the corpus is
// GITIGNORED and regenerated from the pinned upstreams, never committed.
//
// Provenance, and why each expectation can be trusted:
//
//   origin "upstream-assertion"
//     Input AND verdict AND value come from microsoft/node-jsonc-parser's own
//     src/test/json.test.ts, from its assertValidParse/assertInvalidParse
//     calls. These are hand-written third-party assertions.
//
//   origin "reference-oracle"
//     Input comes from a third party — either another helper in that same
//     upstream test file (assertKinds, assertScanError, assertTree,
//     assertVisit, assertLocation, assertMatchesLocation) or from
//     nst/JSONTestSuite test_parsing/*.json — and the verdict/value is
//     computed by RUNNING the reference implementation (the VS Code JSONC
//     parser), compiled from its pinned commit.
//
//   origin "leniency-probe"
//     Input is selected HERE (this is the only hand-picked set), taken from
//     the @tabnas/jsonic README's own list of relaxations, because the jsonc
//     plugin layers on jsonic and every jsonic relaxation is a candidate for
//     leaking through. The verdict still comes from the reference oracle.
//
// Sanity check baked in: every "upstream-assertion" verdict is cross-checked
// against the compiled reference implementation, and the generator throws if
// they ever disagree. A second, independent cross-check compares the oracle
// against JSONTestSuite's own y_/n_ file-name labels and prints the agreement.

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VENDOR = join(REPO, 'test', 'vendor')

const NJP = join(VENDOR, 'node-jsonc-parser')
const JTS = join(VENDOR, 'JSONTestSuite', 'test_parsing')
const SRC = join(NJP, 'src', 'test', 'json.test.ts')
const DST = join(VENDOR, 'corpus.json')

for (const p of [NJP, JTS, SRC, join(NJP, 'lib', 'main.js')]) {
  if (!existsSync(p)) {
    console.error(
      `gen-corpus: missing ${p}\n` +
      `Run scripts/fetch-conformance-suites.sh first.`)
    process.exit(1)
  }
}

const require = createRequire(import.meta.url)
const jsoncParser = require(join(NJP, 'lib', 'main.js'))
const ORACLE_VERSION = JSON.parse(
  readFileSync(join(NJP, 'package.json'), 'utf8')).version
const NJP_SHA = readFileSync(join(NJP, '.pinned-sha'), 'utf8').trim()
const JTS_SHA = readFileSync(
  join(VENDOR, 'JSONTestSuite', '.pinned-sha'), 'utf8').trim()

const lines = readFileSync(SRC, 'utf8').split('\n')

// Split the argument list of a single-line call into top-level argument
// sources. Every helper call in the upstream file is on one line.
function splitArgs(s) {
  const out = []
  let depth = 0
  let start = 0
  let q = null
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if ('\\' === c) { i++; continue }
      if (c === q) q = null
      continue
    }
    if ('"' === c || "'" === c || '`' === c) { q = c; continue }
    if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) depth--
    else if (',' === c && 0 === depth) { out.push(s.slice(start, i)); start = i + 1 }
  }
  out.push(s.slice(start))
  return out.map((x) => x.trim()).filter((x) => '' !== x)
}

function evalJs(code) {
  return vm.runInNewContext('(' + code + ')', {})
}

const HELPERS = [
  'assertKinds', 'assertScanError', 'assertValidParse', 'assertInvalidParse',
  'assertTree', 'assertVisit', 'assertLocation', 'assertMatchesLocation',
]

const cases = []
const seen = new Set()

// De-duplicate on (input, options) WITHIN the upstream extraction: upstream
// repeats the same input across helpers, and a duplicate would silently
// inflate the denominator. JSONTestSuite files are NOT deduplicated — each is
// a distinct file in that suite and is counted as one case, even where two
// files decode to the same string once their (deliberately malformed) UTF-8
// has been through a lossy decode.
function pushUnique(c) {
  const key = JSON.stringify([c.input, c.options])
  if (seen.has(key)) return
  seen.add(key)
  cases.push(c)
}

// The reference verdict: valid iff the reference implementation reported zero
// ParseErrors. (jsonc-parser is error-tolerant and still returns a value, so
// the error count — not the return value — is what says accept vs reject.)
function oracle(input, options) {
  const errors = []
  let value
  try {
    value = jsoncParser.parse(input, errors, options ?? undefined)
  } catch (e) {
    return { valid: false, note: 'reference threw: ' + e.message }
  }
  if (0 < errors.length) return { valid: false }
  return { valid: true, value }
}

let optionsBinding = null

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]

  // Upstream declares `let options = {...}` just above the calls that use it.
  const mo = line.match(/^\s*(?:let|var|const)\s+options\s*(?::\s*ParseOptions)?\s*=\s*(\{.*\});?\s*$/)
  if (mo) { optionsBinding = evalJs(mo[1]); continue }

  const m = line.match(/^\s*(\w+)\((.*)\);\s*$/)
  if (!m) continue
  const [, fn, argsrc] = m
  if (!HELPERS.includes(fn)) continue
  if (line.includes('function ')) continue

  const args = splitArgs(argsrc)
  let input
  try { input = evalJs(args[0]) } catch { continue }
  if ('string' !== typeof input) continue

  if ('assertLocation' === fn || 'assertMatchesLocation' === fn) {
    // These embed a '|' cursor marker; strip it to recover the document.
    if (!input.includes('|')) continue
    input = input.replace('|', '')
  }

  let options = null
  let origin = 'reference-oracle'
  let expected = null

  if ('assertValidParse' === fn || 'assertInvalidParse' === fn) {
    origin = 'upstream-assertion'
    if (2 < args.length) {
      options = 'options' === args[2].trim() ? optionsBinding : evalJs(args[2])
    }
    const wantValid = 'assertValidParse' === fn
    const o = oracle(input, options)
    if (o.valid !== wantValid) {
      throw new Error(
        `upstream assertion disagrees with jsonc-parser@${ORACLE_VERSION} ` +
        `for ${JSON.stringify(input)} (upstream says ${wantValid ? 'valid' : 'invalid'})`)
    }
    expected = wantValid ? { valid: true, value: o.value } : { valid: false }
  } else if ('assertVisit' === fn) {
    // assertVisit's 4th argument is `disallowComments`.
    const dc = 4 <= args.length ? evalJs(args[3]) : false
    options = dc ? { disallowComments: true } : null
    expected = oracle(input, options)
  } else {
    expected = oracle(input, options)
  }

  const rec = {
    name: `upstream:${fn}:${i + 1}`,
    source: `microsoft/node-jsonc-parser@${NJP_SHA} src/test/json.test.ts:${i + 1} (${fn})`,
    origin,
    input,
    options,
    valid: expected.valid,
  }
  if (expected.valid) rec.value = expected.value
  pushUnique(rec)
}

const nUpstream = cases.length

// --- nst/JSONTestSuite ---------------------------------------------------
//
// JSONC is a superset of JSON, so the RFC corpus is legitimate JSONC input;
// the verdict comes from the reference implementation under default options.
let agree = 0
let decided = 0
const disagree = []
for (const f of readdirSync(JTS).sort()) {
  if (!f.endsWith('.json')) continue
  const input = readFileSync(join(JTS, f), 'utf8')
  const o = oracle(input, null)
  // Independent corroboration: JSONTestSuite encodes its own verdict in the
  // file-name prefix. y_/n_ are decided; i_ is implementation-defined.
  if (f.startsWith('y_') || f.startsWith('n_')) {
    decided++
    if (o.valid === f.startsWith('y_')) agree++
    else disagree.push(f)
  }
  const rec = {
    name: `JSONTestSuite:${f}`,
    source: `nst/JSONTestSuite@${JTS_SHA} test_parsing/${f}`,
    origin: 'reference-oracle',
    input,
    options: null,
    valid: o.valid,
  }
  if (o.valid) rec.value = o.value
  cases.push(rec)
}

const nJts = cases.length - nUpstream

// --- base-grammar leniency probe -----------------------------------------
//
// The jsonc plugin does not stand alone: the documented setup is
// `new Tabnas().use(jsonic).use(Jsonc)`, so every relaxation the @tabnas/jsonic
// base grammar allows is a candidate for leaking through into what claims to be
// a JSONC parser. These inputs are the examples jsonic's own README lists as
// its relaxations (README.md "The relaxations"), plus a few JSONC-adjacent
// variants. Unlike the rest of the corpus the INPUTS are selected here; the
// verdicts still come from the reference implementation, and a JSONC parser
// must match the reference on every one of them.
const LENIENCY_PROBE = [
  // jsonic README — "Write less punctuation"
  ['a:1, b:2', 'unquoted keys, no braces'],
  ['a:1 b:2', 'no commas'],
  ['first-name: Sam', 'unquoted key and unquoted value'],
  ['1, 2, 3', 'implicit top-level array'],
  ['[x y z]', 'unquoted space-separated elements'],
  ['{a:1, b:2,}', 'unquoted keys + trailing comma'],
  ['[1, 2', 'dangling structure closes itself at end of input'],
  ['{a:{b:1', 'nested dangling structures close themselves'],
  ['a:', 'empty value means null'],
  // jsonic README — "Path diving"
  ['a:b:c:1', 'colon chain dives into nested objects'],
  ['a:b:1, a:c:2', 'repeated keys deep-merge'],
  ['x:{a:1}, x:{b:2}', 'repeated keys deep-merge'],
  // jsonic README — "Comments"
  ['a:1   # hash comment', 'hash comment (not a JSONC comment form)'],
  ['# hash comment\n{"a":1}', 'hash comment ahead of otherwise valid JSON'],
  ['{"a":1} # hash comment', 'hash comment after otherwise valid JSON'],
  // jsonic README — "More strings"
  ["'hello'", 'single-quoted string'],
  ['`line one\nline two`', 'backtick multi-line string'],
  ['{"b": "\\x42"}', '\\xXX ASCII escape'],
  ['"\\u{41}"', 'braced unicode escape'],
  // jsonic README — "More numbers"
  ['0xFF', 'hex literal'],
  ['0o17', 'octal literal'],
  ['0b1010', 'binary literal'],
  ['1_000_000', 'underscore digit separator'],
  ['1a', 'almost-a-number falls back to a plain string'],
  ['1.2.3', 'almost-a-number falls back to a plain string'],
  ['+1', 'leading plus sign'],
  ['01', 'leading zero'],
  ['5.', 'trailing decimal point'],
  ['0.e1', 'trailing decimal point before exponent'],
  // Two top-level values: does the second get silently discarded?
  ['1 2', 'two top-level numbers'],
  ['"a" "b"', 'two top-level strings'],
  ['true false', 'two top-level booleans'],
  ['null null', 'two top-level nulls'],
  ['1\n2', 'two top-level numbers on separate lines'],
  ['{"a":1} {"b":2}', 'two top-level objects'],
]

for (const [input, why] of LENIENCY_PROBE) {
  const o = oracle(input, null)
  const rec = {
    name: `leniency:${JSON.stringify(input)}`,
    source: `base-grammar leniency probe — ${why} (input from @tabnas/jsonic README "The relaxations")`,
    origin: 'leniency-probe',
    input,
    options: null,
    valid: o.valid,
  }
  if (o.valid) rec.value = o.value
  cases.push(rec)
}

const out = {
  _comment: [
    'DERIVED FILE — gitignored. Regenerate with scripts/fetch-conformance-suites.sh.',
    'Inputs: microsoft/node-jsonc-parser src/test/json.test.ts @ ' + NJP_SHA + ',',
    'plus nst/JSONTestSuite test_parsing/*.json @ ' + JTS_SHA + '.',
    'origin "upstream-assertion": verdict and value are hand-written upstream.',
    'origin "reference-oracle": verdict and value computed by running the reference impl.',
    'origin "leniency-probe": input selected from the @tabnas/jsonic README relaxations; verdict from the reference impl.',
    'A case is valid iff the reference reported zero ParseErrors. "value" absent on a valid case means undefined.',
  ],
  upstream: {
    jsoncParser: { repo: 'https://github.com/microsoft/node-jsonc-parser', commit: NJP_SHA, version: ORACLE_VERSION },
    jsonTestSuite: { repo: 'https://github.com/nst/JSONTestSuite', commit: JTS_SHA },
  },
  counts: {
    total: cases.length,
    upstreamFile: nUpstream,
    jsonTestSuite: nJts,
    leniencyProbe: LENIENCY_PROBE.length,
  },
  cases,
}

writeFileSync(DST, JSON.stringify(out, null, 1) + '\n')

const valid = cases.filter((c) => c.valid).length
console.log(`gen-corpus: wrote ${DST}`)
console.log(`gen-corpus: cases=${cases.length} valid=${valid} invalid=${cases.length - valid}`)
console.log(`gen-corpus: upstream-assertion=${cases.filter((c) => 'upstream-assertion' === c.origin).length}` +
  ` reference-oracle=${cases.filter((c) => 'reference-oracle' === c.origin).length}` +
  ` leniency-probe=${cases.filter((c) => 'leniency-probe' === c.origin).length}`)
console.log(`gen-corpus: oracle vs JSONTestSuite y_/n_ labels: ${agree}/${decided} agree` +
  (disagree.length ? ` (differ: ${disagree.join(' ')})` : ''))
