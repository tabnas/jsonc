// Cross-runtime conformance, driven by the shared `test/spec/*.tsv`
// fixtures at the repository root (see ../../test/AGENTS.md).
//
// The fixture loader, the `ERROR:<code>` contract, the comparison and the
// row loop all come from tabnas_support, whose TypeScript and Go halves
// `ts/test/parity.test.ts` and `go/parity_test.go` use to run the SAME
// files, so the three implementations cannot drift without one of them
// going red, and neither can the loaders.
//
// What is left here is only what is specific to jsonc: how to build the
// parser for a row's options, the sixth input escape, and the UNDEFINED
// vocabulary of the expected column.

mod common;

use tabnas_support::{load_spec_dir, parse_expect, Runner, SpecOptions, Value};

use common::{options_from_cell, parser_for, spec_dir, to_failure, to_value, unescape_jsonc};

/// The header every fixture in this repository carries. There are no
/// bespoke-shaped files and so no exemptions: a file that does not fit
/// this shape is a mistake, not a special case, and `every_fixture_has_the_shared_shape`
/// says so.
const SHARED_HEADER: [&str; 3] = ["input", "expected", "opts"];

fn runner() -> Runner {
    Runner::new_with_row(|_input, row| {
        // The runner's own decoding of the input column is bypassed (see
        // unescape_jsonc), so the raw cell is read and decoded here.
        let input = unescape_jsonc(row.named("input"));

        // A rejection row is satisfied by a failure, so a broken
        // harness (a malformed `opts` cell, a plugin that failed to
        // install) could read as a conformance result. Hand anything
        // that is not a real parse failure back as a VALUE: the row then
        // fails, saying what actually went wrong, instead of passing as a
        // rejection the parser never made. The TypeScript runner does the
        // same.
        let options = match options_from_cell(row.named("opts")) {
            Ok(options) => options,
            Err(error) => return Ok(Value::String(format!("NOT-A-PARSE-ERROR: {error}"))),
        };
        parser_for(options)
            .parse(&input)
            .map(|value| to_value(&value))
            .map_err(to_failure)
    })
    // Trivia-only input yields no value at all, which JSON cannot spell.
    // In TypeScript that is `undefined`, and distinct from a document
    // whose value is null; the Rust engine folds an undefined result into
    // `null` at the end of every parse (`Value::unwrap_undefined`), so an
    // UNDEFINED cell asks for `null` here, exactly as the Go runner reads
    // it. The reading is recorded in ../../DIVERGENCE.md.
    .parse_expected(|expected, _row| {
        if expected == "UNDEFINED" {
            Ok(Value::Null)
        } else {
            parse_expect(expected)
        }
    })
}

/// Every fixture in the spec directory, discovered by listing, so adding
/// a .tsv runs it in all three runtimes without touching any runner. An
/// empty directory fails inside the runner.
#[test]
fn spec() {
    runner().dir(spec_dir());
}

/// The shape contract: every file carries the shared three-column
/// header, so no file is exempt from `spec` and none is run by a bespoke
/// reader nobody registered. Asserted on the files themselves rather
/// than on a list, so a new fixture with another shape fails here first.
#[test]
fn every_fixture_has_the_shared_shape() {
    let specs = load_spec_dir(spec_dir(), &SpecOptions::default()).expect("the fixtures load");
    assert!(
        specs.len() >= 12,
        "expected at least the 12 jsonc fixtures, found {}",
        specs.len()
    );
    for spec in &specs {
        let probe = spec
            .rows
            .first()
            .unwrap_or_else(|| panic!("{}: no cases", spec.file));
        for (index, name) in SHARED_HEADER.iter().enumerate() {
            assert_eq!(
                probe.index_of(name),
                Some(index),
                "{}: column {name} is not at position {index}",
                spec.file
            );
        }
    }
}

/// The custom escape codec, pinned against the TypeScript and Go
/// versions on the cases that tell them apart from the shared codec: a
/// `\0` decodes to NUL, and a `\\0` is a backslash followed by a zero.
#[test]
fn unescape_jsonc_decodes_the_sixth_escape() {
    assert_eq!(unescape_jsonc(r"\0"), "\0");
    assert_eq!(unescape_jsonc(r"\\0"), "\\0");
    assert_eq!(unescape_jsonc(r"a\tb\nc\rd"), "a\tb\nc\rd");
    assert_eq!(unescape_jsonc(r"\x"), r"\x");
    assert_eq!(unescape_jsonc("plain"), "plain");
    assert_eq!(unescape_jsonc(r"trailing\"), r"trailing\");
}
