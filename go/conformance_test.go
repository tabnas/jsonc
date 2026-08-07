/* Copyright (c) 2026 Richard Rodger and other contributors, MIT License */

package tabnasjsonc

// JSONC conformance over the derived corpus at test/vendor/corpus.json — the
// SAME 491 cases ts/test/conformance.test.ts runs, so both runtimes are held
// to one external standard rather than to each other.
//
// The corpus is third-party-derived and is NOT committed. It is regenerated
// from upstreams pinned to commit SHAs by
// scripts/fetch-conformance-suites.sh:
//   - microsoft/node-jsonc-parser @ 3c9b4203 (v3.3.1), the VS Code JSONC
//     reference implementation
//   - nst/JSONTestSuite @ 1ef36fa, the RFC 8259 corpus
//
// Both halves are load-bearing:
//   - a valid case must parse AND produce the reference's value. "no error"
//     alone is not enough.
//   - an invalid case must be REJECTED with an error.
//
// IT NEVER SKIPS. If the corpus is missing the test FAILS with instructions.
//
// THIS SUITE IS EXPECTED TO BE RED. It is a measuring instrument, not a
// target. Do not add a skip list, do not narrow the corpus, and do not weaken
// an assertion to raise the number.
//
// Summary line only:
//
//	go test -run TestConformance -v ./... 2>&1 | grep 'jsonc conformance'

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	jsonic "github.com/tabnas/jsonic/go"
)

// fetchHint is printed whenever a fetched artefact is missing. The test fails
// rather than skipping: a conformance run that silently does not happen is the
// exact defect this suite exists to prevent.
const fetchHint = "The conformance corpora are third-party and are deliberately NOT committed.\n" +
	"Fetch them (pinned commit SHAs, idempotent):\n" +
	"    scripts/fetch-conformance-suites.sh"

type conformanceCase struct {
	Name    string         `json:"name"`
	Source  string         `json:"source"`
	Origin  string         `json:"origin"`
	Input   string         `json:"input"`
	Options map[string]any `json:"options"`
	Valid   bool           `json:"valid"`
	Value   any            `json:"value"`
	// HasValue distinguishes `"value": null` from an absent value; filled in
	// by loadCorpus from the raw JSON.
	HasValue bool `json:"-"`
}

type conformanceCorpus struct {
	Upstream map[string]any    `json:"upstream"`
	Cases    []conformanceCase `json:"cases"`
}

func corpusPath() string {
	return filepath.Join("..", "test", "vendor", "corpus.json")
}

func loadCorpus(t *testing.T) []conformanceCase {
	t.Helper()
	path := corpusPath()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("JSONC conformance corpus not found at %s: %v\n%s", path, err, fetchHint)
	}
	var c conformanceCorpus
	if err := json.Unmarshal(raw, &c); err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}

	// Re-walk the raw JSON to learn which cases carry an explicit "value" key,
	// so an absent value (meaning undefined) is not confused with JSON null.
	var probe struct {
		Cases []map[string]json.RawMessage `json:"cases"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		t.Fatalf("probe %s: %v", path, err)
	}
	if len(probe.Cases) != len(c.Cases) {
		t.Fatalf("corpus probe length mismatch")
	}
	for i := range c.Cases {
		_, ok := probe.Cases[i]["value"]
		c.Cases[i].HasValue = ok
	}
	return c.Cases
}

// canonJSON renders a parsed value as canonical JSON so the Go result compares
// structurally against the reference value decoded from the corpus. The
// marshal/unmarshal/marshal round-trip flattens *OrderedMap into a plain map
// so encoding/json's key sorting applies to both sides.
func canonJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprintf("<unmarshalable: %v>", err)
	}
	var flat any
	if err := json.Unmarshal(b, &flat); err != nil {
		return string(b)
	}
	b2, err := json.Marshal(flat)
	if err != nil {
		return string(b)
	}
	return string(b2)
}

func TestConformance(t *testing.T) {
	cases := loadCorpus(t)

	// Pinned exactly, so the corpus cannot be quietly narrowed to raise the
	// pass rate. Regenerating it legitimately (a new upstream release) changes
	// these numbers, and that change has to be made deliberately here.
	if 491 != len(cases) {
		t.Fatalf("corpus size changed: %d", len(cases))
	}

	upstreamAuthored, jts, lenProbe := 0, 0, 0
	for _, c := range cases {
		if "upstream-assertion" == c.Origin {
			upstreamAuthored++
		}
		if "leniency-probe" == c.Origin {
			lenProbe++
		}
		if strings.HasPrefix(c.Name, "JSONTestSuite:") {
			jts++
		}
	}
	if 48 != upstreamAuthored {
		t.Errorf("the hand-written upstream assertion subset changed size: %d", upstreamAuthored)
	}
	if 318 != jts {
		t.Errorf("the JSONTestSuite subset changed size: %d", jts)
	}
	if 35 != lenProbe {
		t.Errorf("the base-grammar leniency probe changed size: %d", lenProbe)
	}

	// Building a jsonic instance is expensive, so share one per option set.
	instances := map[string]*jsonic.Jsonic{}
	parserFor := func(opts map[string]any) *jsonic.Jsonic {
		k, _ := json.Marshal(opts)
		if j, ok := instances[string(k)]; ok {
			return j
		}
		j := jsonic.Make()
		if 0 < len(opts) {
			if err := j.Use(Jsonc, opts); err != nil {
				t.Fatalf("plugin init: %v", err)
			}
		} else {
			if err := j.Use(Jsonc); err != nil {
				t.Fatalf("plugin init: %v", err)
			}
		}
		instances[string(k)] = j
		return j
	}

	var validPass, validTotal, invalidPass, invalidTotal int
	var upPass, upTotal, lenPass, lenTotal int

	for _, c := range cases {
		c := c
		ok := t.Run(c.Name, func(t *testing.T) {
			j := parserFor(c.Options)
			got, err := j.Parse(c.Input)

			if !c.Valid {
				if nil == err {
					t.Errorf("%s\n  input: %q\n  accepted an invalid document; got %s",
						c.Source, c.Input, canonJSON(got))
				}
				return
			}

			if nil != err {
				t.Errorf("%s\n  input: %q\n  rejected a valid document: %v", c.Source, c.Input, err)
				return
			}

			if !c.HasValue {
				if nil != got {
					t.Errorf("%s\n  input: %q\n  wrong value: got %s, want no value",
						c.Source, c.Input, canonJSON(got))
				}
				return
			}

			want, err := json.Marshal(c.Value)
			if nil != err {
				t.Fatalf("%s: cannot re-marshal expected value: %v", c.Name, err)
			}
			if g := canonJSON(got); g != string(want) {
				t.Errorf("%s\n  input: %q\n  wrong value: got %s, want %s",
					c.Source, c.Input, g, string(want))
			}
		})

		if c.Valid {
			validTotal++
			if ok {
				validPass++
			}
		} else {
			invalidTotal++
			if ok {
				invalidPass++
			}
		}
		if "upstream-assertion" == c.Origin {
			upTotal++
			if ok {
				upPass++
			}
		}
		if "leniency-probe" == c.Origin {
			lenTotal++
			if ok {
				lenPass++
			}
		}
	}

	pct := func(p, n int) string {
		if 0 == n {
			return "n/a"
		}
		return fmt.Sprintf("%.1f%%", 100*float64(p)/float64(n))
	}

	fmt.Printf("[jsonc conformance / Go] corpus=%d"+
		"  valid-accepted-with-correct-value %d/%d (%s)"+
		"  invalid-rejected %d/%d (%s)"+
		"  upstream-authored subset %d/%d (%s)"+
		"  base-grammar leniency probe %d/%d (%s)\n",
		len(cases),
		validPass, validTotal, pct(validPass, validTotal),
		invalidPass, invalidTotal, pct(invalidPass, invalidTotal),
		upPass, upTotal, pct(upPass, upTotal),
		lenPass, lenTotal, pct(lenPass, lenTotal))
}
