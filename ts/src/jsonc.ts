/* Copyright (c) 2021-2025 Richard Rodger, MIT License */

// Import Jsonic types used by plugin.
import { Jsonic } from 'jsonic'

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

function Jsonc(jsonic: Jsonic, options: JsoncOptions) {
  const comment_lex = true !== options.disallowComments
  const rule_exclude = options.allowTrailingComma ? '' : 'comma'

  // Apply grammar: static options and val ZZ rule alt.
  jsonic.grammar(Jsonic.make()(grammarText), { rule: { alt: { g: 'jsonc' } } })

  // Runtime options that depend on plugin arguments.
  jsonic.options({
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
