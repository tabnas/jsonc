/* Copyright (c) 2026 Richard Rodger and other contributors, MIT License */

package tabnasjsonc

// The Go mirror of ts/test/jsontestsuite.test.ts: nst/JSONTestSuite (the RFC
// 8259 corpus) against the jsonc plugin in strict mode.
//
// Until 2026-08 the RFC 8259 corpus ran against the TypeScript implementation
// ONLY — 318 documents the Go port was never measured against, in a repo whose
// whole discipline is "Go must match TS". This file closes that hole.
//
// The corpus is third-party and is NOT committed; scripts/fetch-conformance-suites.sh
// fetches it at a pinned commit SHA into the gitignored test/vendor/.
// See THIRD_PARTY_NOTICES.md.
//
// Both runtimes read the same corpus and the same pin file
// (test/known-lenient.json), so a TS/Go divergence on any pinned case shows up
// as unexpectedReject here rather than as silence.
//
// The pin is NOT a skip list: this test fails if the set grows OR shrinks.
//
// IT NEVER SKIPS. If the corpus is missing the test FAILS with instructions.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	jsonic "github.com/tabnas/jsonic/go"
)

func jtsDir() string {
	return filepath.Join("..", "test", "vendor", "JSONTestSuite", "test_parsing")
}
func jtsPinFile() string {
	return filepath.Join("..", "test", "known-lenient.json")
}

func loadLenientPin(t *testing.T) map[string]string {
	t.Helper()
	raw, err := os.ReadFile(jtsPinFile())
	if err != nil {
		t.Fatalf("read %s: %v", jtsPinFile(), err)
	}
	var pin struct {
		Lenient map[string]string `json:"lenient"`
	}
	if err := json.Unmarshal(raw, &pin); err != nil {
		t.Fatalf("parse %s: %v", jtsPinFile(), err)
	}
	return pin.Lenient
}

func jtsFiles(t *testing.T) []string {
	t.Helper()
	entries, err := os.ReadDir(jtsDir())
	if err != nil {
		t.Fatalf("nst/JSONTestSuite corpus not found at %s: %v\n%s", jtsDir(), err, fetchHint)
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

func TestJSONTestSuite(t *testing.T) {
	files := jtsFiles(t)
	if 318 != len(files) {
		t.Fatalf("expected 318 JSONTestSuite test_parsing files, found %d — "+
			"the corpus must not be narrowed. Re-run scripts/fetch-conformance-suites.sh.",
			len(files))
	}

	pin := loadLenientPin(t)
	if 18 != len(pin) {
		t.Errorf("the known-lenient pin changed size: %d", len(pin))
	}
	inCorpus := map[string]bool{}
	for _, f := range files {
		inCorpus[f] = true
	}
	for k, why := range pin {
		if !inCorpus[k] {
			t.Errorf("pinned file %s is not in the corpus", k)
		}
		if len(why) <= 20 {
			t.Errorf("pinned file %s has no written reason", k)
		}
	}

	// Strict mode: comments off, trailing commas off — the same configuration
	// the TypeScript suite uses.
	j := jsonic.Make()
	if err := j.Use(Jsonc, map[string]any{"disallowComments": true}); err != nil {
		t.Fatalf("plugin init: %v", err)
	}

	var yFail []string
	var unexpectedAccept, unexpectedReject []string

	for _, f := range files {
		src, err := os.ReadFile(filepath.Join(jtsDir(), f))
		if err != nil {
			t.Fatalf("read %s: %v", f, err)
		}
		_, perr := j.Parse(string(src))
		accepted := nil == perr

		switch {
		case strings.HasPrefix(f, "y_"):
			if !accepted {
				yFail = append(yFail, f+": "+strings.SplitN(perr.Error(), "\n", 2)[0])
			}
		case strings.HasPrefix(f, "n_"):
			_, lenient := pin[f]
			if accepted && !lenient {
				unexpectedAccept = append(unexpectedAccept, f)
			}
			if !accepted && lenient {
				unexpectedReject = append(unexpectedReject, f)
			}
		}
	}

	if 0 < len(yFail) {
		t.Errorf("y_* files that failed to parse (%d):\n  %s", len(yFail), strings.Join(yFail, "\n  "))
	}
	if 0 < len(unexpectedAccept) {
		t.Errorf("n_* files accepted but not pinned as lenient (%d):\n  %s",
			len(unexpectedAccept), strings.Join(unexpectedAccept, "\n  "))
	}
	if 0 < len(unexpectedReject) {
		t.Errorf("n_* files pinned as lenient but rejected by the Go port (%d) — "+
			"this is a TS/Go divergence, since the pin records what the canonical "+
			"TypeScript implementation accepts:\n  %s",
			len(unexpectedReject), strings.Join(unexpectedReject, "\n  "))
	}
}

// TestJSONTestSuiteImplementationDefined checks the i_* files — which RFC 8259
// leaves to the implementation — against the verdict of the JSONC reference
// implementation (microsoft/node-jsonc-parser) recorded in the derived corpus.
// The TypeScript suite runs the identical check.
func TestJSONTestSuiteImplementationDefined(t *testing.T) {
	files := jtsFiles(t)
	cases := loadCorpus(t)

	refValid := map[string]bool{}
	for _, c := range cases {
		if strings.HasPrefix(c.Name, "JSONTestSuite:") {
			refValid[strings.TrimPrefix(c.Name, "JSONTestSuite:")] = c.Valid
		}
	}

	j := jsonic.Make()
	if err := j.Use(Jsonc, map[string]any{"disallowComments": true}); err != nil {
		t.Fatalf("plugin init: %v", err)
	}

	seen := 0
	var diverged []string
	for _, f := range files {
		if !strings.HasPrefix(f, "i_") {
			continue
		}
		seen++
		src, err := os.ReadFile(filepath.Join(jtsDir(), f))
		if err != nil {
			t.Fatalf("read %s: %v", f, err)
		}
		_, perr := j.Parse(string(src))
		accepted := nil == perr

		want, ok := refValid[f]
		if !ok {
			t.Errorf("%s missing from the derived corpus", f)
			continue
		}
		if accepted != want {
			diverged = append(diverged, f)
		}
	}
	if 0 == seen {
		t.Fatal("expected at least one i_* file")
	}
	if 0 < len(diverged) {
		t.Errorf("i_* divergence from the JSONC reference implementation (%d):\n  %s",
			len(diverged), strings.Join(diverged, "\n  "))
	}
}
