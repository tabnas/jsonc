/* Copyright (c) 2021-2025 Richard Rodger and other contributors, MIT License */

// Parse-level test cases in this file were ported from
// microsoft/node-jsonc-parser (src/test/json.test.ts), Copyright (c)
// Microsoft Corporation, MIT License. See THIRD_PARTY_NOTICES.md.

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { Jsonic } from 'jsonic'
import { Jsonc } from '../dist/jsonc.js'


const j = Jsonic.make().use(Jsonc)


describe('jsonc', () => {

  test('happy', () => {
    assert.deepEqual(j('{"a":1}'), { a: 1 })
  })


  test('comments', () => {
    assert.deepEqual(j('// this is a comment'), undefined)
    assert.deepEqual(j('// this is a comment\n'), undefined)
    assert.deepEqual(j('/* this is a comment*/'), undefined)
    assert.deepEqual(j('/* this is a \r\ncomment*/'), undefined)
    assert.deepEqual(j('/* this is a \ncomment*/'), undefined)
    assert.throws(() => j('/* this is a'), /unterminated_comment/)
    assert.throws(() => j('/* this is a \ncomment'), /unterminated_comment/)
    assert.throws(() => j('/ ttt'), /unexpected/)
  })


  test('strings', () => {
    assert.deepEqual(j('"test"'), 'test')
    assert.deepEqual(j('"\\""'), '"')
    assert.deepEqual(j('"\\/"'), '/')
    assert.deepEqual(j('"\\b"'), '\b')
    assert.deepEqual(j('"\\f"'), '\f')
    assert.deepEqual(j('"\\n"'), '\n')
    assert.deepEqual(j('"\\r"'), '\r')
    assert.deepEqual(j('"\\t"'), '\t')
    assert.deepEqual(j('"\u88ff"'), '\u88ff')
    assert.deepEqual(j('"\u200B\u2028"'), '\u200B\u2028')
    assert.throws(() => j('"\\v"'), /unexpected/)
    assert.throws(() => j('"test'), /unterminated_string/)
    assert.throws(() => j('"test\n"'), /unprintable/)
    assert.throws(() => j('"\t"'), /unprintable/)
    assert.throws(() => j('"\t "'), /unprintable/)
    assert.throws(() => j('"\0 "'), /unprintable/)
  })


  test('numbers', () => {
    assert.deepEqual(j('0'), 0)
    assert.deepEqual(j('0.1'), 0.1)
    assert.deepEqual(j('-0.1'), -0.1)
    assert.deepEqual(j('-1'), -1)
    assert.deepEqual(j('1'), 1)
    assert.deepEqual(j('123456789'), 123456789)
    assert.deepEqual(j('10'), 10)
    assert.deepEqual(j('90'), 90)
    assert.deepEqual(j('90E+123'), 90E+123)
    assert.deepEqual(j('90e+123'), 90e+123)
    assert.deepEqual(j('90e-123'), 90e-123)
    assert.deepEqual(j('90E-123'), 90E-123)
    assert.deepEqual(j('90E123'), 90E123)
    assert.deepEqual(j('90e123'), 90e123)
    assert.deepEqual(j('01'), 1)
    assert.deepEqual(j('-01'), -1)
    assert.throws(() => j('-'), /unexpected/)
    assert.throws(() => j('.0'), /unexpected/)
  })


  test('keywords', () => {
    assert.deepEqual(j('true'), true)
    assert.deepEqual(j('false'), false)
    assert.deepEqual(j('null'), null)

    assert.throws(() => j('nulllll'), /unexpected/)
    assert.throws(() => j('True'), /unexpected/)
    assert.throws(() => j('foo-bar'), /unexpected/)
    assert.throws(() => j('foo bar'), /unexpected/)

    assert.deepEqual(j('false//hello'), false)
  })


  test('trivia', () => {
    assert.deepEqual(j(' '), undefined)
    assert.deepEqual(j('  \t  '), undefined)
    assert.deepEqual(j('  \t  \n  \t  '), undefined)
    assert.deepEqual(j('\r\n'), undefined)
    assert.deepEqual(j('\r'), undefined)
    assert.deepEqual(j('\n'), undefined)
    assert.deepEqual(j('\n\r'), undefined)
    assert.deepEqual(j('\n   \n'), undefined)
  })


  test('literals', () => {
    assert.deepEqual(j('true'), true)
    assert.deepEqual(j('false'), false)
    assert.deepEqual(j('null'), null)
    assert.deepEqual(j('"foo"'), 'foo')
    assert.deepEqual(j('"\\"-\\\\-\\/-\\b-\\f-\\n-\\r-\\t"'), '"-\\-/-\b-\f-\n-\r-\t')
    assert.deepEqual(j('"\\u00DC"'), '\u00DC')
    assert.deepEqual(j('9'), 9)
    assert.deepEqual(j('-9'), -9)
    assert.deepEqual(j('0.129'), 0.129)
    assert.deepEqual(j('23e3'), 23e3)
    assert.deepEqual(j('1.2E+3'), 1.2E+3)
    assert.deepEqual(j('1.2E-3'), 1.2E-3)
    assert.deepEqual(j('1.2E-3 // comment'), 1.2E-3)
  })


  test('objects', () => {
    assert.deepEqual(j('{}'), {})
    assert.deepEqual(j('{ "foo": true }'), { foo: true })
    assert.deepEqual(j('{ "bar": 8, "xoo": "foo" }'), { bar: 8, xoo: 'foo' })
    assert.deepEqual(j('{ "hello": [], "world": {} }'), { hello: [], world: {} })
    assert.deepEqual(j('{ "a": false, "b": true, "c": [ 7.4 ] }'), { a: false, b: true, c: [7.4] })
    assert.deepEqual(j('{ "lineComment": "//", "blockComment": ["/*", "*/"], "brackets": [ ["{", "}"], ["[", "]"], ["(", ")"] ] }'),
      { lineComment: '//', blockComment: ['/*', '*/'], brackets: [['{', '}'], ['[', ']'], ['(', ')']] })
    assert.deepEqual(j('{ "hello": [], "world": {} }'), { hello: [], world: {} })
    assert.deepEqual(j('{ "hello": { "again": { "inside": 5 }, "world": 1 }}'), { hello: { again: { inside: 5 }, world: 1 } })
    assert.deepEqual(j('{ "foo": /*hello*/true }'), { foo: true })
    assert.deepEqual(j('{ "": true }'), { '': true })
  })


  test('arrays', () => {
    assert.deepEqual(j('[]'), [])
    assert.deepEqual(j('[ [],  [ [] ]]'), [[], [[]]])
    assert.deepEqual(j('[ 1, 2, 3 ]'), [1, 2, 3])
    assert.deepEqual(j('[ { "a": null } ]'), [{ a: null }])
  })


  test('objects with errors', () => {
    assert.throws(() => j('{,}'))
    assert.throws(() => j('{ "foo": true, }'))
    assert.throws(() => j('{ "bar": 8 "xoo": "foo" }'))
    assert.throws(() => j('{ ,"bar": 8 }'))
    assert.throws(() => j('{ ,"bar": 8, "foo" }'))
    assert.throws(() => j('{ "bar": 8, "foo": }'))
    assert.throws(() => j('{ 8, "foo": 9 }'))
  })


  test('array with errors', () => {
    assert.throws(() => j('[,]'))
    assert.throws(() => j('[ 1 2, 3 ]'))
    assert.throws(() => j('[ ,1, 2, 3 ]'))
    assert.throws(() => j('[ ,1, 2, 3, ]'))
  })


  test('errors', () => {
    assert.throws(() => j('1,1'))
    assert.throws(() => j(''))
  })


  test('disallow comments', () => {
    const nc = Jsonic.make().use(Jsonc, { disallowComments: true })

    assert.deepEqual(nc('[ 1, 2, null, "foo" ]'), [1, 2, null, 'foo'])
    assert.deepEqual(nc('{ "hello": [], "world": {} }'), { hello: [], world: {} })

    assert.throws(() => nc('{ "foo": /*comment*/ true }'))
  })


  test('trailing comma', () => {
    const jc = Jsonic.make().use(Jsonc, { allowTrailingComma: true })

    assert.deepEqual(jc('{ "hello": [], }'), { hello: [] })
    assert.deepEqual(jc('{ "hello": [] }'), { hello: [] })
    assert.deepEqual(jc('{ "hello": [], "world": {}, }'), { hello: [], world: {} })
    assert.deepEqual(jc('{ "hello": [], "world": {} }'), { hello: [], world: {} })
    assert.deepEqual(jc('[ 1, 2, ]'), [1, 2])
    assert.deepEqual(jc('[ 1, 2 ]'), [1, 2])

    assert.throws(() => j('{ "hello": [], }'))
    assert.throws(() => j('{ "hello": [], "world": {}, }'))
    assert.throws(() => j('[ 1, 2, ]'))
  })

  test('misc', () => {

    assert.deepEqual(j('{ "foo": "bar" }'), { "foo": "bar" })
    assert.deepEqual(j('{ "foo": {"bar": 1, "car": 2 } }'), { "foo": { "bar": 1, "car": 2 } })
    assert.deepEqual(j('{ "foo": {"bar": 1, "car": 8 }, "goo": {} }'), { "foo": { "bar": 1, "car": 8 }, "goo": {} })
    assert.throws(() => j('{ "dep": {"bar": 1, "car": '))
    assert.throws(() => j('{ "dep": {"bar": 1,, "car": '))
    assert.throws(() => j('{ "dep": {"bar": "na", "dar": "ma", "car":  } }'))

    assert.deepEqual(j('["foo", null ]'), ["foo", null])
    assert.throws(() => j('["foo", null, ]'))
    assert.throws(() => j('["foo", null,, ]'))
    assert.throws(() => j('[["foo", null,, ],'))

    assert.deepEqual(j('true'), true)
    assert.deepEqual(j('false'), false)
    assert.deepEqual(j('null'), null)
    assert.deepEqual(j('23'), 23)
    assert.deepEqual(j('-1.93e-19'), -1.93e-19)
    assert.deepEqual(j('"hello"'), "hello")

    assert.deepEqual(j('[]'), [])
    assert.deepEqual(j('[ 1 ]'), [1])
    assert.deepEqual(j('[ 1, "x"]'), [1, "x"])
    assert.deepEqual(j('[[]]'), [[]])
    assert.deepEqual(j('{ }'), {})
    assert.deepEqual(j('{ "val": 1 }'), { "val": 1 })
    assert.deepEqual(j('{"id": "$", "v": [ null, null] }'),
      { "id": "$", "v": [null, null] })

    assert.throws(() => j('{  "id": { "foo": { } } , }'))

    assert.deepEqual(j('{ }'), {})
    assert.deepEqual(j('{ "foo": "bar" }'), { "foo": "bar" })
    assert.deepEqual(j('{ "foo": { "goo": 3 } }'), { "foo": { "goo": 3 } })
    assert.deepEqual(j('[]'), [])
    assert.deepEqual(j('[ true, null, [] ]'), [true, null, []])
    assert.deepEqual(j('[\r\n0,\r\n1,\r\n2\r\n]'), [0, 1, 2])
    assert.deepEqual(j('/* g */ { "foo": //f\n"bar" }'), { foo: 'bar' })
    assert.deepEqual(j('/* g\r\n */ { "foo": //f\n"bar" }'), { foo: 'bar' })
    assert.deepEqual(j('/* g\n */ { "foo": //f\n"bar"\n}'), { foo: 'bar' })
    assert.throws(() => j('{"prop1":"foo","prop2":"foo2","prop3":{"prp1":{""}}}'  ))
    assert.deepEqual(j('{ "key1": { "key11": [ "val111", "val112" ] }, "key2": [ { "key21": false, "key22": 221 }, null, [{}] ] }'),
      { "key1": { "key11": ["val111", "val112"] }, "key2": [{ "key21": false, "key22": 221 }, null, [{}]] })

  })


  // Verify the grammar() setting {rule:{alt:{g:'jsonc'}}} tagged every
  // alt installed by the jsonc plugin with 'jsonc'.
  test('alt g jsonc tag', () => {
    const jc: any = Jsonic.make().use(Jsonc, { allowTrailingComma: true })
    const rsm: any = jc.internal().parser.rsm

    const checks: { rule: string; side: 'open' | 'close' }[] = [
      { rule: 'val', side: 'open' },
      { rule: 'pair', side: 'close' },
      { rule: 'elem', side: 'close' },
    ]

    for (const { rule, side } of checks) {
      const rs = rsm[rule]
      assert.ok(rs, `rule ${rule} missing`)
      const alts = rs.def[side] as any[]
      const tagged = alts.filter((a) => {
        const g = Array.isArray(a.g) ? a.g : String(a.g || '').split(/\s*,\s*/)
        return g.includes('jsonc')
      })
      assert.ok(tagged.length > 0, `rule ${rule}.${side} has no 'jsonc'-tagged alt`)
    }
  })
})
