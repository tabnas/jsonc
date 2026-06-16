/* Copyright (c) 2021-2025 Richard Rodger, MIT License */

// The engine is the tabnas parser; jsonic supplies the relaxed-JSON
// grammar that the embedded grammar text is authored in.
import { Tabnas } from '@tabnas/parser'
import { jsonic } from '@tabnas/jsonic'

type JsoncOptions = {
  allowTrailingComma?: boolean
  disallowComments?: boolean
}

// --- BEGIN EMBEDDED jsonc-grammar.jsonic ---
const grammarText = `
# JSONC Grammar Definition
# Parsed by a standard Jsonic instance and passed to jsonic.grammar()
# Extends standard JSON grammar with end-of-input value handling.

{
  options: text: { lex: false }
  options: number: { hex: false oct: false bin: false sep: null exclude: "@/^\\\\./" }
  options: string: { chars: '"' multiChars: '' allowUnknown: false }
  options: string: escape: { v: null }
  options: map: { extend: false }
  options: lex: { empty: false }
  options: rule: { finish: false }

  rule: val: open: {
    alts: [
      { s: '#ZZ' g: jsonc }
    ]
    inject: { append: true }
  }

  rule: pair: close: {
    alts: [
      { s: '#CA #CB' b: 1 g: comma }
    ]
    inject: {}
  }

  rule: elem: close: {
    alts: [
      { s: '#CA #CS' b: 1 g: comma }
    ]
    inject: {}
  }
}
`
// --- END EMBEDDED jsonc-grammar.jsonic ---

function Jsonc(tn: Tabnas, options: JsoncOptions) {
  const comment_lex = true !== options.disallowComments
  const rule_exclude = options.allowTrailingComma ? '' : 'comma'

  // Parse the embedded relaxed-JSON grammar text with a jsonic-grammar
  // engine, then install the resulting spec on this tabnas instance.
  tn.grammar(new Tabnas().use(jsonic).parse(grammarText), { rule: { alt: { g: 'jsonc' } } })

  // Runtime options that depend on plugin arguments.
  tn.options({
    comment: {
      lex: comment_lex,
    },
    rule: {
      include: 'jsonc,json',
      exclude: rule_exclude,
    },
  })
}

export { Jsonc }

export type { JsoncOptions }
