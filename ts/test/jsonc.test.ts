/* Copyright (c) 2021-2025 Richard Rodger and other contributors, MIT License */

// Parse-level test cases in this file were ported from
// microsoft/node-jsonc-parser (src/test/json.test.ts), Copyright (c)
// Microsoft Corporation, MIT License. See THIRD_PARTY_NOTICES.md.

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'
import { Jsonc } from '../dist/jsonc.js'


const j = new Tabnas().use(jsonic).use(Jsonc)


describe('jsonc', () => {

  test('happy', () => {
    assert.deepEqual(j.parse('{"a":1}'), { a: 1 })
  })


  test('comments', () => {
    assert.deepEqual(j.parse('// this is a comment'), undefined)
    assert.deepEqual(j.parse('// this is a comment\n'), undefined)
    assert.deepEqual(j.parse('/* this is a comment*/'), undefined)
    assert.deepEqual(j.parse('/* this is a \r\ncomment*/'), undefined)
    assert.deepEqual(j.parse('/* this is a \ncomment*/'), undefined)
    assert.throws(() => j.parse('/* this is a'), /unterminated_comment/)
    assert.throws(() => j.parse('/* this is a \ncomment'), /unterminated_comment/)
    assert.throws(() => j.parse('/ ttt'), /unexpected/)
  })


  test('strings', () => {
    assert.deepEqual(j.parse('"test"'), 'test')
    assert.deepEqual(j.parse('"\\""'), '"')
    assert.deepEqual(j.parse('"\\/"'), '/')
    assert.deepEqual(j.parse('"\\b"'), '\b')
    assert.deepEqual(j.parse('"\\f"'), '\f')
    assert.deepEqual(j.parse('"\\n"'), '\n')
    assert.deepEqual(j.parse('"\\r"'), '\r')
    assert.deepEqual(j.parse('"\\t"'), '\t')
    assert.deepEqual(j.parse('"\u88ff"'), '\u88ff')
    assert.deepEqual(j.parse('"\u200B\u2028"'), '\u200B\u2028')
    assert.throws(() => j.parse('"\\v"'), /unexpected/)
    assert.throws(() => j.parse('"test'), /unterminated_string/)
    assert.throws(() => j.parse('"test\n"'), /unprintable/)
    assert.throws(() => j.parse('"\t"'), /unprintable/)
    assert.throws(() => j.parse('"\t "'), /unprintable/)
    assert.throws(() => j.parse('"\0 "'), /unprintable/)
  })


  test('numbers', () => {
    assert.deepEqual(j.parse('0'), 0)
    assert.deepEqual(j.parse('0.1'), 0.1)
    assert.deepEqual(j.parse('-0.1'), -0.1)
    assert.deepEqual(j.parse('-1'), -1)
    assert.deepEqual(j.parse('1'), 1)
    assert.deepEqual(j.parse('123456789'), 123456789)
    assert.deepEqual(j.parse('10'), 10)
    assert.deepEqual(j.parse('90'), 90)
    assert.deepEqual(j.parse('90E+123'), 90E+123)
    assert.deepEqual(j.parse('90e+123'), 90e+123)
    assert.deepEqual(j.parse('90e-123'), 90e-123)
    assert.deepEqual(j.parse('90E-123'), 90E-123)
    assert.deepEqual(j.parse('90E123'), 90E123)
    assert.deepEqual(j.parse('90e123'), 90e123)
    assert.deepEqual(j.parse('01'), 1)
    assert.deepEqual(j.parse('-01'), -1)
    assert.throws(() => j.parse('-'), /unexpected/)
    assert.throws(() => j.parse('.0'), /unexpected/)
  })


  test('keywords', () => {
    assert.deepEqual(j.parse('true'), true)
    assert.deepEqual(j.parse('false'), false)
    assert.deepEqual(j.parse('null'), null)

    assert.throws(() => j.parse('nulllll'), /unexpected/)
    assert.throws(() => j.parse('True'), /unexpected/)
    assert.throws(() => j.parse('foo-bar'), /unexpected/)
    assert.throws(() => j.parse('foo bar'), /unexpected/)

    assert.deepEqual(j.parse('false//hello'), false)
  })


  test('trivia', () => {
    assert.deepEqual(j.parse(' '), undefined)
    assert.deepEqual(j.parse('  \t  '), undefined)
    assert.deepEqual(j.parse('  \t  \n  \t  '), undefined)
    assert.deepEqual(j.parse('\r\n'), undefined)
    assert.deepEqual(j.parse('\r'), undefined)
    assert.deepEqual(j.parse('\n'), undefined)
    assert.deepEqual(j.parse('\n\r'), undefined)
    assert.deepEqual(j.parse('\n   \n'), undefined)
  })


  test('literals', () => {
    assert.deepEqual(j.parse('true'), true)
    assert.deepEqual(j.parse('false'), false)
    assert.deepEqual(j.parse('null'), null)
    assert.deepEqual(j.parse('"foo"'), 'foo')
    assert.deepEqual(j.parse('"\\"-\\\\-\\/-\\b-\\f-\\n-\\r-\\t"'), '"-\\-/-\b-\f-\n-\r-\t')
    assert.deepEqual(j.parse('"\\u00DC"'), '\u00DC')
    assert.deepEqual(j.parse('9'), 9)
    assert.deepEqual(j.parse('-9'), -9)
    assert.deepEqual(j.parse('0.129'), 0.129)
    assert.deepEqual(j.parse('23e3'), 23e3)
    assert.deepEqual(j.parse('1.2E+3'), 1.2E+3)
    assert.deepEqual(j.parse('1.2E-3'), 1.2E-3)
    assert.deepEqual(j.parse('1.2E-3 // comment'), 1.2E-3)
  })


  test('objects', () => {
    assert.deepEqual(j.parse('{}'), {})
    assert.deepEqual(j.parse('{ "foo": true }'), { foo: true })
    assert.deepEqual(j.parse('{ "bar": 8, "xoo": "foo" }'), { bar: 8, xoo: 'foo' })
    assert.deepEqual(j.parse('{ "hello": [], "world": {} }'), { hello: [], world: {} })
    assert.deepEqual(j.parse('{ "a": false, "b": true, "c": [ 7.4 ] }'), { a: false, b: true, c: [7.4] })
    assert.deepEqual(j.parse('{ "lineComment": "//", "blockComment": ["/*", "*/"], "brackets": [ ["{", "}"], ["[", "]"], ["(", ")"] ] }'),
      { lineComment: '//', blockComment: ['/*', '*/'], brackets: [['{', '}'], ['[', ']'], ['(', ')']] })
    assert.deepEqual(j.parse('{ "hello": [], "world": {} }'), { hello: [], world: {} })
    assert.deepEqual(j.parse('{ "hello": { "again": { "inside": 5 }, "world": 1 }}'), { hello: { again: { inside: 5 }, world: 1 } })
    assert.deepEqual(j.parse('{ "foo": /*hello*/true }'), { foo: true })
    assert.deepEqual(j.parse('{ "": true }'), { '': true })
  })


  test('arrays', () => {
    assert.deepEqual(j.parse('[]'), [])
    assert.deepEqual(j.parse('[ [],  [ [] ]]'), [[], [[]]])
    assert.deepEqual(j.parse('[ 1, 2, 3 ]'), [1, 2, 3])
    assert.deepEqual(j.parse('[ { "a": null } ]'), [{ a: null }])
  })


  test('objects with errors', () => {
    assert.throws(() => j.parse('{,}'))
    assert.throws(() => j.parse('{ "foo": true, }'))
    assert.throws(() => j.parse('{ "bar": 8 "xoo": "foo" }'))
    assert.throws(() => j.parse('{ ,"bar": 8 }'))
    assert.throws(() => j.parse('{ ,"bar": 8, "foo" }'))
    assert.throws(() => j.parse('{ "bar": 8, "foo": }'))
    assert.throws(() => j.parse('{ 8, "foo": 9 }'))
  })


  test('array with errors', () => {
    assert.throws(() => j.parse('[,]'))
    assert.throws(() => j.parse('[ 1 2, 3 ]'))
    assert.throws(() => j.parse('[ ,1, 2, 3 ]'))
    assert.throws(() => j.parse('[ ,1, 2, 3, ]'))
  })


  test('errors', () => {
    assert.throws(() => j.parse('1,1'))
    assert.throws(() => j.parse(''))
  })


  test('disallow comments', () => {
    const nc = new Tabnas().use(jsonic).use(Jsonc, { disallowComments: true })

    assert.deepEqual(nc.parse('[ 1, 2, null, "foo" ]'), [1, 2, null, 'foo'])
    assert.deepEqual(nc.parse('{ "hello": [], "world": {} }'), { hello: [], world: {} })

    assert.throws(() => nc.parse('{ "foo": /*comment*/ true }'))
  })


  test('trailing comma', () => {
    const jc = new Tabnas().use(jsonic).use(Jsonc, { allowTrailingComma: true })

    assert.deepEqual(jc.parse('{ "hello": [], }'), { hello: [] })
    assert.deepEqual(jc.parse('{ "hello": [] }'), { hello: [] })
    assert.deepEqual(jc.parse('{ "hello": [], "world": {}, }'), { hello: [], world: {} })
    assert.deepEqual(jc.parse('{ "hello": [], "world": {} }'), { hello: [], world: {} })
    assert.deepEqual(jc.parse('[ 1, 2, ]'), [1, 2])
    assert.deepEqual(jc.parse('[ 1, 2 ]'), [1, 2])

    assert.throws(() => j.parse('{ "hello": [], }'))
    assert.throws(() => j.parse('{ "hello": [], "world": {}, }'))
    assert.throws(() => j.parse('[ 1, 2, ]'))
  })

  test('misc', () => {

    assert.deepEqual(j.parse('{ "foo": "bar" }'), { "foo": "bar" })
    assert.deepEqual(j.parse('{ "foo": {"bar": 1, "car": 2 } }'), { "foo": { "bar": 1, "car": 2 } })
    assert.deepEqual(j.parse('{ "foo": {"bar": 1, "car": 8 }, "goo": {} }'), { "foo": { "bar": 1, "car": 8 }, "goo": {} })
    assert.throws(() => j.parse('{ "dep": {"bar": 1, "car": '))
    assert.throws(() => j.parse('{ "dep": {"bar": 1,, "car": '))
    assert.throws(() => j.parse('{ "dep": {"bar": "na", "dar": "ma", "car":  } }'))

    assert.deepEqual(j.parse('["foo", null ]'), ["foo", null])
    assert.throws(() => j.parse('["foo", null, ]'))
    assert.throws(() => j.parse('["foo", null,, ]'))
    assert.throws(() => j.parse('[["foo", null,, ],'))

    assert.deepEqual(j.parse('true'), true)
    assert.deepEqual(j.parse('false'), false)
    assert.deepEqual(j.parse('null'), null)
    assert.deepEqual(j.parse('23'), 23)
    assert.deepEqual(j.parse('-1.93e-19'), -1.93e-19)
    assert.deepEqual(j.parse('"hello"'), "hello")

    assert.deepEqual(j.parse('[]'), [])
    assert.deepEqual(j.parse('[ 1 ]'), [1])
    assert.deepEqual(j.parse('[ 1, "x"]'), [1, "x"])
    assert.deepEqual(j.parse('[[]]'), [[]])
    assert.deepEqual(j.parse('{ }'), {})
    assert.deepEqual(j.parse('{ "val": 1 }'), { "val": 1 })
    assert.deepEqual(j.parse('{"id": "$", "v": [ null, null] }'),
      { "id": "$", "v": [null, null] })

    assert.throws(() => j.parse('{  "id": { "foo": { } } , }'))

    assert.deepEqual(j.parse('{ }'), {})
    assert.deepEqual(j.parse('{ "foo": "bar" }'), { "foo": "bar" })
    assert.deepEqual(j.parse('{ "foo": { "goo": 3 } }'), { "foo": { "goo": 3 } })
    assert.deepEqual(j.parse('[]'), [])
    assert.deepEqual(j.parse('[ true, null, [] ]'), [true, null, []])
    assert.deepEqual(j.parse('[\r\n0,\r\n1,\r\n2\r\n]'), [0, 1, 2])
    assert.deepEqual(j.parse('/* g */ { "foo": //f\n"bar" }'), { foo: 'bar' })
    assert.deepEqual(j.parse('/* g\r\n */ { "foo": //f\n"bar" }'), { foo: 'bar' })
    assert.deepEqual(j.parse('/* g\n */ { "foo": //f\n"bar"\n}'), { foo: 'bar' })
    assert.throws(() => j.parse('{"prop1":"foo","prop2":"foo2","prop3":{"prp1":{""}}}'  ))
    assert.deepEqual(j.parse('{ "key1": { "key11": [ "val111", "val112" ] }, "key2": [ { "key21": false, "key22": 221 }, null, [{}] ] }'),
      { "key1": { "key11": ["val111", "val112"] }, "key2": [{ "key21": false, "key22": 221 }, null, [{}]] })

  })


  // Verify the grammar() setting {rule:{alt:{g:'jsonc'}}} tagged every
  // alt installed by the jsonc plugin with 'jsonc'.
  test('alt g jsonc tag', () => {
    const jc: any = new Tabnas().use(jsonic).use(Jsonc, { allowTrailingComma: true })
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
