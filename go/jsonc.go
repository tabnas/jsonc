/* Copyright (c) 2021-2025 Richard Rodger, MIT License */

package tabnasjsonc

import (
	// jsonic registers the engine's text parser when it loads
	// (tabnas.RegisterTextParser, in jsonic's init), and Jsonc reads its
	// grammar with j.GrammarText, which fails with "no text parser
	// registered" without one. Importing it here makes that hold for every
	// program that imports this package, as the TypeScript plugin imports
	// @tabnas/jsonic to read the same grammar.
	_ "github.com/tabnas/jsonic/go"
	tabnas "github.com/tabnas/parser/go"
)

// VERSION is this module's version. It MUST equal ts/package.json
// "version": the release orchestrator rewrites both, and
// TestVersionMatchesPackageJSON fails the build if they drift.
const VERSION = "0.5.14"

// --- BEGIN EMBEDDED jsonc-grammar.jsonic ---
const grammarText = `
# JSONC Grammar Definition
# Parsed by a standard Jsonic instance and passed to jsonic.grammar()
# Extends standard JSON grammar with end-of-input value handling.

{
  options: text: { lex: false }
  options: number: { hex: false oct: false bin: false sep: null exclude: "@/^\\./" }
  options: string: { chars: '"' multiChars: '' allowUnknown: false escapeStrict: true }
  options: string: escape: { v: null }
  options: comment: def: hash: { lex: false }
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

// Jsonc configures a jsonic instance for JSONC parsing.
func Jsonc(j *tabnas.Tabnas, pluginOpts map[string]any) error {
	commentLex := true != toBool(pluginOpts["disallowComments"])
	ruleExclude := "comma"
	if toBool(pluginOpts["allowTrailingComma"]) {
		ruleExclude = ""
	}

	// Apply grammar: static options, rules, and trailing comma alts.
	if err := j.GrammarText(grammarText, &tabnas.GrammarSetting{
		Rule: &tabnas.GrammarSettingRule{
			Alt: &tabnas.GrammarSettingAlt{G: "jsonc"},
		},
	}); err != nil {
		return err
	}

	// Runtime options that depend on plugin arguments. Note that
	// `string.escapeStrict` is NOT re-applied here: the grammar text is the
	// single source of truth for it and the engine's grammar-text option
	// converter carries the key across.
	j.SetOptions(tabnas.Options{
		Comment: &tabnas.CommentOptions{Lex: &commentLex},
		Rule: &tabnas.RuleOptions{
			Include: "jsonc,json",
			Exclude: ruleExclude,
		},
	})

	return nil
}

func toBool(v any) bool {
	b, _ := v.(bool)
	return b
}
