/* Copyright (c) 2021-2025 Richard Rodger, MIT License */

package tabnasjsonc

import (
	// jsonic is the base Make builds on. It also registers the engine's
	// text parser when it loads (tabnas.RegisterTextParser, in jsonic's
	// init), and Jsonc reads its grammar with j.GrammarText, which fails
	// with "no text parser registered" without one. Importing it here makes
	// that hold for every program that imports this package, as the
	// TypeScript plugin imports @tabnas/jsonic to read the same grammar.
	tabnasjsonic "github.com/tabnas/jsonic/go"
	tabnas "github.com/tabnas/parser/go"
)

// VERSION is this module's version. It MUST equal ts/package.json
// "version": the release orchestrator rewrites both, and
// TestVersionMatchesPackageJSON fails the build if they drift.
const VERSION = "0.5.17"

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

// Make builds a JSONC parser whole: jsonic's base (tabnasjsonic.Make) with
// Jsonc installed, as `tabnasjsonic.Make()` then `j.Use(Jsonc, opts)`
// builds it, and with lex.window declared, so that Tabnas.ParseReader
// reads a reader a window at a time rather than whole (admin ADR-30).
// Every token of the grammar, jsonic's base included, is cut by the
// engine's matchers; jsonic's string pre-scan, which refuses a raw control
// character in a string, reads through the window (jsonic 0.7.11); and
// neither plugin's actions read the source. The window is
// declared here, on the parser this package makes whole, and not in Jsonc,
// which a host may install beneath matchers of its own.
//
// The options are Jsonc's (allowTrailingComma, disallowComments); several
// maps merge, a later key winning. Infallible by design: the grammar text
// is fixed and the options are read as booleans, so a failure to install
// is a bug in this package, and Make panics on it.
func Make(options ...map[string]any) *tabnas.Tabnas {
	merged := map[string]any{}
	for _, o := range options {
		for k, v := range o {
			merged[k] = v
		}
	}
	j := tabnasjsonic.Make()
	if err := j.Use(Jsonc, merged); err != nil {
		panic("jsonc: the embedded grammar does not install: " + err.Error())
	}
	yes := true
	j.SetOptions(tabnas.Options{Lex: &tabnas.LexOptions{Window: &yes}})
	return j
}

func toBool(v any) bool {
	b, _ := v.(bool)
	return b
}
