// Performance regression guard. Mirrors go/perf_test.go
// (TestParseReusesInstance) and ts/test/perf.test.ts.
//
// The regression guarded is the usage: build ONE instance and reuse it
// for many parses, never rebuilding the engine and grammar per parse.
// Building the grammar dominates a parse. The check is machine
// independent: it compares reuse against a single parse and against the
// rebuild-per-parse anti-pattern on the SAME machine in the SAME run, so
// a slow box cannot make it flaky (everything scales together). There is
// deliberately NO absolute wall-clock budget.

use std::time::{Duration, Instant};

use tabnas_jsonc::make;

const SRC: &str = r#"{"a":1,"b":[2,3],"c":"x"}"#; // tiny representative JSONC value
const N: u32 = 2000;

/// The rebuild loop runs fewer times than the reuse loop and the two are
/// compared per parse. The Go and TypeScript suites rebuild N times too,
/// but a debug-profile Rust build of the jsonic grammar costs tens of
/// milliseconds, and 2000 of them turn a guard into a minute-long wait
/// that says nothing more than 50 do.
const REBUILDS: u32 = 50;

#[test]
fn reusing_one_instance_stays_linear_and_beats_rebuild_per_parse() {
    // Build the reusable instance once (the expensive step).
    let parser = make();

    // Warm the reuse path so the comparison is steady-state, and sanity
    // check the parse result en route.
    for _ in 0..100 {
        let value = parser.parse(SRC).expect("warm reuse parse");
        assert_eq!(
            value.to_string(),
            r#"{"a":1,"b":[2,3],"c":"x"}"#,
            "the warm parse result"
        );
    }

    // Time one isolated (already warmed) parse on the reused instance.
    let started = Instant::now();
    parser.parse(SRC).expect("single parse");
    let single = started.elapsed();

    // Time N parses reusing the ONE instance.
    let started = Instant::now();
    for _ in 0..N {
        parser.parse(SRC).expect("reuse parse");
    }
    let reuse = started.elapsed();

    // Time parses that REBUILD a fresh instance every call: the
    // anti-pattern this guards against.
    let started = Instant::now();
    for _ in 0..REBUILDS {
        let rebuilt = make();
        rebuilt.parse(SRC).expect("rebuild parse");
    }
    let rebuild = started.elapsed();
    let avg_rebuild = rebuild / REBUILDS;

    // 1) Reuse must stay (near) linear: amortized per-parse time over N
    //    reused parses should be within a small factor of a single warmed
    //    parse. Allow 4x for scheduling and timer-granularity noise on a
    //    tiny input.
    let avg_reuse = reuse / N;
    if single > Duration::ZERO {
        assert!(
            avg_reuse <= single * 4,
            "reuse is not staying linear: {N} reused parses took {reuse:?} \
             (avg {avg_reuse:?}/parse) vs {single:?} for a single parse \
             (ratio {:.1}x, limit 4x)",
            avg_reuse.as_secs_f64() / single.as_secs_f64()
        );
    }

    // 2) Reuse must be dramatically faster than rebuilding per parse.
    //    Building the grammar dominates, so rebuild-per-parse is many
    //    times slower than reuse; requiring >4x both documents the win
    //    and would FAIL if a future change made representative usage
    //    rebuild on every parse.
    assert!(
        avg_rebuild >= avg_reuse * 4,
        "rebuild-per-parse is not dominated by reuse as expected: \
         rebuild={avg_rebuild:?}/parse reuse={avg_reuse:?}/parse (ratio {:.1}x, expected >4x). \
         Building the grammar should dominate; reuse a single instance.",
        avg_rebuild.as_secs_f64() / avg_reuse.as_secs_f64()
    );

    eprintln!(
        "[perf] single={single:?}  reuse(N={N})={reuse:?} avg={avg_reuse:?}  \
         rebuild(N={REBUILDS})={rebuild:?} avg={avg_rebuild:?}  reuse/single={:.2}x  rebuild/reuse={:.1}x",
        avg_reuse.as_secs_f64() / single.max(Duration::from_nanos(1)).as_secs_f64(),
        avg_rebuild.as_secs_f64() / avg_reuse.as_secs_f64()
    );
}
