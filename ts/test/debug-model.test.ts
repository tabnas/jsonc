// @ts-nocheck
/* Copyright (c) 2026 Richard Rodger and other contributors, MIT License */

/*  debug-model.test.js
 *  Composition test: the jsonc grammar plugin layered with the official
 *  @tabnas/debug plugin. @tabnas/debug is a declared devDependency, so
 *  under `npm test` it is always present. This used to SKIP when it was
 *  absent, which meant a broken or unlinked devDependency silently disabled
 *  the composition test while the run still reported green. It now FAILS
 *  instead; point TABNAS_DEBUG_PATH at a sibling checkout's built plugin
 *  (e.g. ../../debug/ts/dist/debug.js) if package resolution differs.
 */
'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert')

const { Tabnas } = require('@tabnas/parser')
const { jsonic } = require('@tabnas/jsonic')
const { Jsonc } = require('../dist/jsonc.js')

function loadDebug() {
  const candidates = [process.env.TABNAS_DEBUG_PATH, '@tabnas/debug'].filter(
    Boolean,
  )
  for (const c of candidates) {
    try {
      return require(c).Debug
    } catch {
      /* try next */
    }
  }
  return null
}

const Debug = loadDebug()

// NOT a skip. @tabnas/debug is a devDependency of this package; if it cannot
// be resolved the composition test must go RED, not quietly vanish.
if (!Debug) {
  describe('compose: jsonc + @tabnas/debug', () => {
    it('@tabnas/debug must be resolvable', () => {
      assert.fail(
        '@tabnas/debug could not be required. It is a declared devDependency, ' +
        'so `npm test` must be able to load it. Run `npm install` in ts/ (and ' +
        're-run admin/scripts/link.sh for a sibling checkout), or set ' +
        'TABNAS_DEBUG_PATH to a built debug plugin. This test FAILS rather ' +
        'than skips so a missing dependency cannot hide the composition check.')
    })
  })
}

// Build the jsonc grammar instance exactly as the repo's own tests do.
function makeJsonc() {
  return new Tabnas().use(jsonic).use(Jsonc)
}

// Guarded so the missing-dependency failure above is the ONLY failure when
// debug is unresolvable; the model assertions would otherwise fail as noise.
if (Debug) describe('compose: jsonc + @tabnas/debug', () => {
  it('parses normally with the debug plugin installed', () => {
    const tn = makeJsonc()
    tn.use(Debug, { print: false, trace: false })
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(tn.parse('{ "a": [1, 2], /* c */ "b": true }'))),
      { a: [1, 2], b: true },
    )
  })

  it('debug.model() returns the structured jsonc grammar', () => {
    const tn = makeJsonc()
    tn.use(Debug, { print: false, trace: false })
    const m = tn.debug.model()

    // The structured rule set: jsonc inherits jsonic's shared
    // val / map / list / pair / elem rules (no jsonc-specific rules).
    assert.deepStrictEqual(
      m.rules.map((r) => r.name).sort(),
      ['elem', 'list', 'map', 'pair', 'val'],
    )

    // The entry rule. (model() exposes the start at config.start.)
    assert.equal(m.config.start, 'val')

    // The plugin stack is reported in install order.
    assert.deepStrictEqual(
      m.plugins.map((p) => p.name),
      ['jsonic', 'Jsonc', 'Debug'],
    )

    // Structural fact 1: val is a choice whose open alts push the
    // map and list rules (objects and arrays).
    const val = m.rules.find((r) => r.name === 'val')
    assert.ok(
      val.open.some((a) => a.push === 'map'),
      'val should push map',
    )
    assert.ok(
      val.open.some((a) => a.push === 'list'),
      'val should push list',
    )

    // Structural fact 2: the rule-reference graph encodes the recursive
    // descent. map -> pair, list -> elem (open pushes), and pair/elem
    // loop back onto themselves via close-replace edges.
    const edge = (name) => m.graph.find((g) => g.name === name)
    assert.deepStrictEqual(edge('map').openPush, ['pair'])
    assert.deepStrictEqual(edge('list').openPush, ['elem'])
    assert.deepStrictEqual(edge('pair').openPush, ['val'])
    assert.deepStrictEqual(edge('elem').openPush, ['val'])
    assert.deepStrictEqual(edge('pair').closeReplace, ['pair'])
    assert.deepStrictEqual(edge('elem').closeReplace, ['elem'])

    // The structured grammar is JSON-serialisable and round-trips.
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(m)).rules,
      JSON.parse(JSON.stringify(m.rules)),
    )
  })
})
