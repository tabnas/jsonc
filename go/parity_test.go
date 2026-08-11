// Copyright (c) 2025 Richard Rodger and other contributors, MIT License

package tabnasjsonc

// parity_test.go — cross-runtime conformance, driven by the shared
// `test/spec/*.tsv` fixtures at the repo root (see ../test/AGENTS.md).
//
// The fixture loader, the escape codec, the ERROR:<code> contract and the
// row loop all come from github.com/tabnas/support/go, whose TypeScript
// half ts/test/parity.test.ts uses to run the SAME files — so the two
// implementations cannot drift without one of them going red, and neither
// can the two loaders.
//
// What is left here is only what is specific to jsonc.

import (
	"encoding/json"
	"strings"
	"testing"

	jsonic "github.com/tabnas/jsonic/go"
	support "github.com/tabnas/support/go"
)

// TestSpec runs every fixture in the spec directory. FindSpecDir walks up
// from the package directory, and Dir discovers the files by listing, so
// adding a .tsv runs it in both runtimes without touching either runner.
func TestSpec(t *testing.T) {
	dir, err := support.FindSpecDir("")
	if err != nil {
		t.Fatal(err)
	}

	support.Runner{
		// A fresh parser per row: the `opts` column is per-case, and
		// plugin options must not leak from one row into the next.
		//
		// The runner's own decoding of the input column is bypassed — see
		// specUnescape below — so the raw cell is read and decoded here.
		ParseRow: func(_ string, row *support.Row) (any, error) {
			input := specUnescape(row.Named("input"))

			opts := map[string]any{}
			if raw := row.Named("opts"); "" != raw {
				if err := json.Unmarshal([]byte(raw), &opts); err != nil {
					return nil, err
				}
			}

			j := jsonic.Make()
			if err := j.Use(Jsonc, opts); err != nil {
				return nil, err
			}
			return j.Parse(input)
		},

		// Trivia-only input yields no value at all, which JSON cannot
		// spell. In TypeScript that is `undefined`, and distinct from a
		// document whose value is null; Go returns a bare nil for both,
		// and specUndefined below folds the engine's sentinel into it.
		ParseExpected: func(expected string, _ *support.Row) (any, error) {
			if "UNDEFINED" == expected {
				return nil, nil
			}
			return support.ParseExpect(expected)
		},

		Normalize: func(v any) any { return jsonFlatten(specUndefined(v)) },
	}.Dir(t, dir)
}

// specUnescape is the one thing this repo does not take from the support
// module: its own escape codec, because jsonc's fixtures need a sixth
// escape.
//
// A raw NUL inside a string must be rejected as `unprintable`, and a NUL
// cannot be written literally in a .tsv — git would call the file binary.
// The shared codec passes \0 through unchanged on purpose (a fixture has
// to be able to carry a literal backslash-zero; json5's \\0 rows rely on
// exactly that), so decoding it has to happen here, in one pass over the
// RAW cell. Two passes cannot work: after the shared codec, \0 from \0 and
// \0 from \\0 are the same two characters.
//
// Kept byte-identical to unescapeJsonc in ts/test/parity.test.ts.
func specUnescape(s string) string {
	if !strings.Contains(s, `\`) {
		return s
	}

	var b strings.Builder
	b.Grow(len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if '\\' == c && i+1 < len(s) {
			switch s[i+1] {
			case 'n':
				b.WriteByte('\n')
				i++
				continue
			case 'r':
				b.WriteByte('\r')
				i++
				continue
			case 't':
				b.WriteByte('\t')
				i++
				continue
			case '0':
				b.WriteByte(0)
				i++
				continue
			case '\\':
				b.WriteByte('\\')
				i++
				continue
			}
		}
		b.WriteByte(c)
	}
	return b.String()
}

// specUndefined folds the engine's undefined sentinel into a plain nil,
// which is what an UNDEFINED cell asks for here.
func specUndefined(v any) any {
	if nil != v && jsonic.IsUndefined(v) {
		return nil
	}
	return v
}

// jsonFlatten renders a value as JSON and reads it back as plain
// map/slice/float64/string/bool/nil. A value that will not marshal is
// returned as it is: the comparison then fails and prints it, which says
// more than a panic here would.
func jsonFlatten(v any) any {
	raw, err := json.Marshal(v)
	if err != nil {
		return v
	}
	var out any
	if err := json.Unmarshal(raw, &out); err != nil {
		return v
	}
	return out
}
