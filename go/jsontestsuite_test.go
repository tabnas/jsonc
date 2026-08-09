// Copyright (c) 2026 Richard Rodger and other contributors, MIT License

package tabnasjsonc

// jsontestsuite_test.go — the Go mirror of ts/test/jsontestsuite.test.ts:
// nst/JSONTestSuite (the RFC 8259 corpus) against the jsonc plugin in the same
// three option modes.
//
// Until now the RFC 8259 corpus ran against the TypeScript implementation
// ONLY — 318 documents the Go port had never been measured against, in a repo
// whose stated discipline is "Go must match TS". This file closes that hole.
//
// Both runtimes read the SAME corpus (vendored at test/JSONTestSuite/, with
// its upstream LICENSE — see THIRD_PARTY_NOTICES.md) and the SAME pin file
// (test/known-lenient.json), so a TS/Go divergence on any pinned case shows up
// as a failure here rather than as silence.
//
// The pin is NOT a skip list: this test fails if a lenience is gained OR lost.
//
// IT NEVER SKIPS. The corpus is vendored in this repository, so it is always
// available; if it is missing the test FAILS. A conformance run that silently
// does not happen is worse than no conformance run at all.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	jsonic "github.com/tabnas/jsonic/go"
)

func jtsDir() string     { return filepath.Join("..", "test", "JSONTestSuite", "test_parsing") }
func jtsPinFile() string { return filepath.Join("..", "test", "known-lenient.json") }

type lenientPin struct {
	Strict        map[string]string `json:"strict"`
	Comments      map[string]string `json:"comments"`
	TrailingComma map[string]string `json:"trailingComma"`
	IAccepted     []string          `json:"implementationDefinedAccepted"`
}

func loadLenientPin(t *testing.T) lenientPin {
	t.Helper()
	raw, err := os.ReadFile(jtsPinFile())
	if err != nil {
		t.Fatalf("cross-runtime pin not found at %s: %v — it is committed to this "+
			"repository and is read by both runtimes", jtsPinFile(), err)
	}
	var pin lenientPin
	if err := json.Unmarshal(raw, &pin); err != nil {
		t.Fatalf("parse %s: %v", jtsPinFile(), err)
	}
	return pin
}

func jtsFiles(t *testing.T) []string {
	t.Helper()
	entries, err := os.ReadDir(jtsDir())
	if err != nil {
		t.Fatalf("nst/JSONTestSuite corpus not found at %s: %v — it is VENDORED in "+
			"this repository, so a missing corpus means the conformance claim is "+
			"unverified. This test fails rather than skips.", jtsDir(), err)
	}
	var out []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".json") {
			out = append(out, e.Name())
		}
	}
	sort.Strings(out)
	return out
}

func countPrefix(files []string, prefix string) int {
	n := 0
	for _, f := range files {
		if strings.HasPrefix(f, prefix) {
			n++
		}
	}
	return n
}

func TestJSONTestSuitePresent(t *testing.T) {
	files := jtsFiles(t)
	if 318 != len(files) {
		t.Fatalf("JSONTestSuite test_parsing corpus size changed: found %d, want 318 — "+
			"the corpus must not be narrowed", len(files))
	}
	if got := countPrefix(files, "y_"); 95 != got {
		t.Errorf("y_* count: got %d, want 95", got)
	}
	if got := countPrefix(files, "n_"); 188 != got {
		t.Errorf("n_* count: got %d, want 188", got)
	}
	if got := countPrefix(files, "i_"); 35 != got {
		t.Errorf("i_* count: got %d, want 35", got)
	}

	// The pin is only worth anything if every entry names a real corpus file
	// and carries a written reason.
	pin := loadLenientPin(t)
	inCorpus := map[string]bool{}
	for _, f := range files {
		inCorpus[f] = true
	}
	for _, set := range []map[string]string{pin.Strict, pin.Comments, pin.TrailingComma} {
		for f, why := range set {
			if !inCorpus[f] {
				t.Errorf("pinned file %s is not in the corpus", f)
			}
			if 20 >= len(why) {
				t.Errorf("pinned file %s has no written reason", f)
			}
		}
	}
	for _, f := range pin.IAccepted {
		if !inCorpus[f] {
			t.Errorf("pinned i_* file %s is not in the corpus", f)
		}
	}
	if 15 != len(pin.Strict) {
		t.Errorf("strict pin size: got %d, want 15", len(pin.Strict))
	}
	if 3 != len(pin.Comments) {
		t.Errorf("comments pin size: got %d, want 3", len(pin.Comments))
	}
	if 4 != len(pin.TrailingComma) {
		t.Errorf("trailingComma pin size: got %d, want 4", len(pin.TrailingComma))
	}
	if 31 != len(pin.IAccepted) {
		t.Errorf("implementationDefinedAccepted size: got %d, want 31", len(pin.IAccepted))
	}
}

func TestJSONTestSuite(t *testing.T) {
	files := jtsFiles(t)
	pin := loadLenientPin(t)

	union := func(sets ...map[string]string) map[string]bool {
		out := map[string]bool{}
		for _, s := range sets {
			for k := range s {
				out[k] = true
			}
		}
		return out
	}

	// The same three modes ts/test/jsontestsuite.test.ts runs, with the same
	// cumulative allowlists.
	modes := []struct {
		name    string
		options map[string]any
		lenient map[string]bool
	}{
		{"strict (disallowComments)", map[string]any{"disallowComments": true},
			union(pin.Strict)},
		{"default (comments)", map[string]any{},
			union(pin.Strict, pin.Comments)},
		{"allowTrailingComma", map[string]any{"allowTrailingComma": true},
			union(pin.Strict, pin.Comments, pin.TrailingComma)},
	}

	wantIAccepted := append([]string(nil), pin.IAccepted...)
	sort.Strings(wantIAccepted)

	for _, mode := range modes {
		t.Run(mode.name, func(t *testing.T) {
			j := jsonic.Make()
			if err := j.Use(Jsonc, mode.options); err != nil {
				t.Fatalf("plugin init: %v", err)
			}

			var yFail, unexpectedAccept, unexpectedReject, iAccepted []string

			for _, f := range files {
				src, err := os.ReadFile(filepath.Join(jtsDir(), f))
				if err != nil {
					t.Fatalf("read %s: %v", f, err)
				}
				_, perr := j.Parse(string(src))
				accepted := nil == perr

				switch {
				case strings.HasPrefix(f, "y_"):
					// JSONC is a JSON superset: every valid JSON document must
					// parse, in every mode.
					if !accepted {
						yFail = append(yFail, f+": "+strings.SplitN(perr.Error(), "\n", 2)[0])
					}
				case strings.HasPrefix(f, "n_"):
					if accepted && !mode.lenient[f] {
						unexpectedAccept = append(unexpectedAccept, f)
					}
					if !accepted && mode.lenient[f] {
						unexpectedReject = append(unexpectedReject, f)
					}
				case strings.HasPrefix(f, "i_"):
					if accepted {
						iAccepted = append(iAccepted, f)
					}
				}
			}

			if 0 < len(yFail) {
				t.Errorf("y_* files that failed to parse (%d):\n  %s",
					len(yFail), strings.Join(yFail, "\n  "))
			}
			if 0 < len(unexpectedAccept) {
				t.Errorf("n_* files accepted but not pinned as lenient (%d):\n  %s",
					len(unexpectedAccept), strings.Join(unexpectedAccept, "\n  "))
			}
			if 0 < len(unexpectedReject) {
				t.Errorf("n_* files pinned as lenient but rejected by the Go port (%d) — "+
					"the pin records what the canonical TypeScript implementation accepts, "+
					"so this is a TS/Go divergence:\n  %s",
					len(unexpectedReject), strings.Join(unexpectedReject, "\n  "))
			}

			sort.Strings(iAccepted)
			if !equalStrings(iAccepted, wantIAccepted) {
				t.Errorf("i_* accepted set diverged from test/known-lenient.json\n"+
					"  got  (%d): %s\n  want (%d): %s",
					len(iAccepted), strings.Join(iAccepted, " "),
					len(wantIAccepted), strings.Join(wantIAccepted, " "))
			}
		})
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
