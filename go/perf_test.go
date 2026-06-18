/* Copyright (c) 2021-2025 Richard Rodger, MIT License */

package tabnasjsonc

import (
	"testing"
	"time"

	jsonic "github.com/tabnas/jsonic/go"
)

// TestParseReusesInstance guards against the performance footgun that the
// other tabnas plugins' convenience Parse() entry points hit: rebuilding the
// (expensive) engine + grammar on every parse instead of reusing one built
// instance. Building the grammar dominates a parse.
//
// jsonc has NO package-level convenience Parse(): it is a plugin users
// install themselves (jsonic.Make().Use(Jsonc)). So there is nothing for the
// package to cache — the regression we can guard is the *usage*: build ONE
// instance and reuse it for many parses, never rebuilding per parse.
//
// This test asserts that reusing one instance for N parses stays close to
// linear in the single-parse cost (amortized per-parse time ~= one parse),
// and that the build-per-parse anti-pattern is dramatically slower. Both
// halves run on the SAME machine in the SAME run, so a slow CI box cannot
// make it flaky (both sides scale together) — there is deliberately NO
// absolute wall-clock budget.
func TestParseReusesInstance(t *testing.T) {
	const src = `{"a":1,"b":[2,3],"c":"x"}` // tiny representative JSONC value
	const n = 2000

	// Build the reusable instance once (the expensive step).
	j := jsonic.Make()
	if err := j.Use(Jsonc); err != nil {
		t.Fatalf("Use(Jsonc): %v", err)
	}

	// Warm the reuse path so the comparison is steady-state, and sanity-check
	// the parse result en route.
	for i := 0; i < 100; i++ {
		if _, err := j.Parse(src); err != nil {
			t.Fatalf("warm reuse parse error: %v", err)
		}
	}

	// Time one isolated (already-warmed) parse on the reused instance.
	t0 := time.Now()
	if _, err := j.Parse(src); err != nil {
		t.Fatalf("single parse error: %v", err)
	}
	single := time.Since(t0)

	// Time N parses reusing the ONE instance.
	t1 := time.Now()
	for i := 0; i < n; i++ {
		if _, err := j.Parse(src); err != nil {
			t.Fatalf("reuse parse error: %v", err)
		}
	}
	reuse := time.Since(t1)

	// Time N parses that REBUILD a fresh instance every call — the
	// anti-pattern this guards against.
	t2 := time.Now()
	for i := 0; i < n; i++ {
		rj := jsonic.Make()
		if err := rj.Use(Jsonc); err != nil {
			t.Fatalf("rebuild Use(Jsonc): %v", err)
		}
		if _, err := rj.Parse(src); err != nil {
			t.Fatalf("rebuild parse error: %v", err)
		}
	}
	rebuild := time.Since(t2)

	// 1) Reuse must stay (near) linear: amortized per-parse time over N reused
	//    parses should be within a small factor of a single warmed parse.
	//    Allow 4x for scheduling / timer-granularity noise on a tiny input.
	avgReuse := reuse / n
	if single > 0 && avgReuse > 4*single {
		t.Errorf("reuse is not staying linear: %d reused parses took %v "+
			"(avg %v/parse) vs %v for a single parse (ratio %.1fx, limit 4x)",
			n, reuse, avgReuse, single, float64(avgReuse)/float64(single))
	}

	// 2) Reuse must be dramatically faster than rebuilding per parse. Building
	//    the grammar dominates, so rebuild-per-parse is many times slower than
	//    reuse here; requiring >4x both documents the win and would FAIL if a
	//    future change made representative usage rebuild on every parse.
	if rebuild < 4*reuse {
		t.Errorf("rebuild-per-parse is not dominated by reuse as expected: "+
			"rebuild=%v reuse=%v (ratio %.1fx, expected >4x). Building the "+
			"grammar should dominate — reuse a single instance.",
			rebuild, reuse, float64(rebuild)/float64(reuse))
	}

	t.Logf("single=%v  reuse(N=%d)=%v avg=%v  rebuild(N=%d)=%v  reuse/single=%.2fx  rebuild/reuse=%.1fx",
		single, n, reuse, avgReuse, n, rebuild,
		float64(avgReuse)/float64(maxDur(single, 1)), float64(rebuild)/float64(reuse))
}

// maxDur avoids a divide-by-zero in the log line when a single warmed parse
// is faster than the timer's resolution.
func maxDur(a, b time.Duration) time.Duration {
	if a > b {
		return a
	}
	return b
}
