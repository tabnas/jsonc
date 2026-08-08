/* Copyright (c) 2026 Richard Rodger, MIT License */

// The exported VERSION must equal package.json "version".
//
// This is the CI check for version drift. It exists because the constant HAS
// drifted: @tabnas/json exported Version = '1.0.0' for several releases while
// the package shipped 0.4.x, because nothing rewrote it and AGENTS.md wrongly
// claimed `make publish-go` kept it in sync. A release that bumps
// package.json and forgets the constant now fails here.
//
// The package root is loaded via `require('..')` rather than `../dist/jsonc.js`
// so that this also proves VERSION is reachable from the published entry
// point. package.json is read the same way, and a failure to read either is a
// hard failure: a version check that silently does not run is the exact
// failure mode being designed out.

import { test, describe } from 'node:test'
import assert from 'node:assert'

describe('version', () => {

  test('VERSION matches package.json', () => {
    const pkg = require('../package.json')
    const api = require('..')

    assert.equal(
      api.VERSION,
      pkg.version,
      `VERSION drift: ${pkg.name} exports ${api.VERSION} but package.json is ` +
        `${pkg.version}. Both are rewritten by admin/publish.sh at release; ` +
        `if you bumped one by hand, bump the other.`,
    )
  })


  test('VERSION is exported and looks like a semver', () => {
    const api = require('..')

    assert.equal(typeof api.VERSION, 'string', 'VERSION must be exported as a string')
    assert.match(api.VERSION, /^\d+\.\d+\.\d+/, 'VERSION must be a semver')
  })

})
