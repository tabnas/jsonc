// The Rust mirror of ts/test/jsontestsuite.test.ts and
// go/jsontestsuite_test.go: nst/JSONTestSuite (the RFC 8259 corpus,
// Copyright (c) 2016 Nicolas Seriot, MIT License) against the jsonc
// plugin in the same three option modes.
//
// All three runtimes read the SAME corpus (vendored at
// test/JSONTestSuite/, with its upstream LICENSE; see
// THIRD_PARTY_NOTICES.md) and the SAME pin file (test/known-lenient.json),
// so a divergence on any pinned case shows up as a failure here rather
// than as silence. Each file in test_parsing/ is classified by prefix:
//
//   y_*  must parse successfully, in every mode (JSONC is a JSON superset)
//   n_*  must be rejected, except the pinned per-mode allowlists
//   i_*  implementation-defined: the verdict is pinned, not merely counted
//
// The pin is NOT a skip list: this test fails if a lenience is gained OR
// lost. Update it deliberately when behaviour genuinely changes; never
// re-pin to silence a red run.
//
// IT NEVER SKIPS. The corpus is vendored in this repository, so it is
// always available; if it is missing the test FAILS. A conformance run
// that silently does not happen is worse than no conformance run at all.

mod common;

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::PathBuf;

use tabnas_jsonc::{make_with, JsoncOptions};

use common::repo_root;

fn corpus_dir() -> PathBuf {
    repo_root()
        .join("test")
        .join("JSONTestSuite")
        .join("test_parsing")
}

fn pin_file() -> PathBuf {
    repo_root().join("test").join("known-lenient.json")
}

/// The shared cross-runtime pin, read by hand from its JSON: the keys
/// ending in `-note` are prose for the reader and are not case names.
struct LenientPin {
    strict: BTreeMap<String, String>,
    comments: BTreeMap<String, String>,
    trailing_comma: BTreeMap<String, String>,
    i_accepted: Vec<String>,
}

fn load_pin() -> LenientPin {
    let raw = fs::read_to_string(pin_file()).unwrap_or_else(|error| {
        panic!(
            "cross-runtime pin not found at {}: {error}. It is committed to this \
             repository and is read by all three runtimes.",
            pin_file().display()
        )
    });
    let pin: serde_json::Value = serde_json::from_str(&raw)
        .unwrap_or_else(|error| panic!("parse {}: {error}", pin_file().display()));

    let reasons = |key: &str| -> BTreeMap<String, String> {
        pin[key]
            .as_object()
            .unwrap_or_else(|| panic!("known-lenient.json: {key} is not an object"))
            .iter()
            .map(|(file, why)| {
                (
                    file.clone(),
                    why.as_str()
                        .unwrap_or_else(|| {
                            panic!("known-lenient.json: {key}.{file} is not a string")
                        })
                        .to_string(),
                )
            })
            .collect()
    };
    let i_accepted = pin["implementationDefinedAccepted"]
        .as_array()
        .expect("known-lenient.json: implementationDefinedAccepted is an array")
        .iter()
        .map(|file| {
            file.as_str()
                .expect("known-lenient.json: an i_* entry is a string")
                .to_string()
        })
        .collect();

    LenientPin {
        strict: reasons("strict"),
        comments: reasons("comments"),
        trailing_comma: reasons("trailingComma"),
        i_accepted,
    }
}

/// The sorted case file names. Panics, with the reason, when the corpus
/// is not there: this suite fails rather than skips.
fn corpus() -> Vec<String> {
    let entries = fs::read_dir(corpus_dir()).unwrap_or_else(|error| {
        panic!(
            "nst/JSONTestSuite corpus not found at {}: {error}. It is VENDORED in \
             this repository, so a missing corpus means the conformance claim is \
             unverified. This test fails rather than skips.",
            corpus_dir().display()
        )
    });
    let mut files: Vec<String> = entries
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.ends_with(".json"))
        .collect();
    files.sort();
    files
}

/// A case's source as the parser sees it. The TypeScript suite reads
/// each file as UTF-8, and Node decodes an invalid sequence to U+FFFD;
/// a lossy read is the same decoding, so the invalid-UTF-8 and UTF-16
/// cases reach the parser as the same text they reach the canonical
/// runtime as.
fn source(file: &str) -> String {
    let bytes =
        fs::read(corpus_dir().join(file)).unwrap_or_else(|error| panic!("read {file}: {error}"));
    String::from_utf8_lossy(&bytes).into_owned()
}

fn count_prefix(files: &[String], prefix: &str) -> usize {
    files.iter().filter(|f| f.starts_with(prefix)).count()
}

#[test]
fn suite_is_present_and_intact() {
    let files = corpus();
    assert_eq!(
        files.len(),
        318,
        "JSONTestSuite test_parsing corpus size changed: the corpus must not be narrowed"
    );
    assert_eq!(count_prefix(&files, "y_"), 95, "y_* count");
    assert_eq!(count_prefix(&files, "n_"), 188, "n_* count");
    assert_eq!(count_prefix(&files, "i_"), 35, "i_* count");
}

/// The pin is only worth anything if every entry names a real corpus
/// file and carries a written reason. A pin that has drifted off the
/// corpus, or that records a lenience nobody justified, is an allowlist
/// pretending to be a measurement.
#[test]
fn known_lenient_pin_is_intact() {
    let files = corpus();
    let pin = load_pin();
    let in_corpus: BTreeSet<&str> = files.iter().map(String::as_str).collect();

    let mut missing = Vec::new();
    let mut unreasoned = Vec::new();
    for set in [&pin.strict, &pin.comments, &pin.trailing_comma] {
        for (file, why) in set {
            if !in_corpus.contains(file.as_str()) {
                missing.push(file.clone());
            }
            if why.len() <= 20 {
                unreasoned.push(file.clone());
            }
        }
    }
    assert!(
        missing.is_empty(),
        "pinned files that are not in the corpus: {missing:?}"
    );
    assert!(
        unreasoned.is_empty(),
        "pinned files with no written reason: {unreasoned:?}"
    );

    let i_missing: Vec<&String> = pin
        .i_accepted
        .iter()
        .filter(|file| !in_corpus.contains(file.as_str()))
        .collect();
    assert!(
        i_missing.is_empty(),
        "pinned i_* files that are not in the corpus: {i_missing:?}"
    );

    // Sizes pinned so a set cannot be quietly grown.
    assert_eq!(pin.strict.len(), 15, "strict pin size");
    assert_eq!(pin.comments.len(), 3, "comments pin size");
    assert_eq!(pin.trailing_comma.len(), 4, "trailingComma pin size");
    assert_eq!(
        pin.i_accepted.len(),
        31,
        "implementationDefinedAccepted size"
    );
}

#[test]
fn rfc_8259_corpus_in_all_three_modes() {
    let files = corpus();
    let pin = load_pin();

    let union = |sets: &[&BTreeMap<String, String>]| -> BTreeSet<String> {
        sets.iter().flat_map(|set| set.keys().cloned()).collect()
    };

    // The same three modes the TypeScript and Go suites run, with the
    // same cumulative allowlists.
    let modes: [(&str, JsoncOptions, BTreeSet<String>); 3] = [
        (
            "strict (disallowComments)",
            JsoncOptions::new().with_disallow_comments(true),
            union(&[&pin.strict]),
        ),
        (
            "default (comments)",
            JsoncOptions::new(),
            union(&[&pin.strict, &pin.comments]),
        ),
        (
            "allowTrailingComma",
            JsoncOptions::new().with_allow_trailing_comma(true),
            union(&[&pin.strict, &pin.comments, &pin.trailing_comma]),
        ),
    ];

    let mut want_i_accepted = pin.i_accepted.clone();
    want_i_accepted.sort();

    let mut report = Vec::new();

    for (name, options, lenient) in modes {
        let parser = make_with(options);

        let mut y_fail = Vec::new();
        let mut unexpected_accept = Vec::new();
        let mut unexpected_reject = Vec::new();
        let mut i_accepted = Vec::new();

        for file in &files {
            let outcome = parser.parse(&source(file));
            let accepted = outcome.is_ok();

            if file.starts_with("y_") {
                // JSONC is a JSON superset: every valid JSON document must
                // parse, in every mode.
                if let Err(error) = outcome {
                    y_fail.push(format!("{file}: {}", error.code));
                }
            } else if file.starts_with("n_") {
                if accepted && !lenient.contains(file) {
                    unexpected_accept.push(file.clone());
                }
                if !accepted && lenient.contains(file) {
                    unexpected_reject.push(file.clone());
                }
            } else if file.starts_with("i_") && accepted {
                i_accepted.push(file.clone());
            }
        }

        if !y_fail.is_empty() {
            report.push(format!(
                "[{name}] y_* files that failed to parse ({}):\n  {}",
                y_fail.len(),
                y_fail.join("\n  ")
            ));
        }
        if !unexpected_accept.is_empty() {
            report.push(format!(
                "[{name}] n_* files accepted but not pinned as lenient ({}):\n  {}",
                unexpected_accept.len(),
                unexpected_accept.join("\n  ")
            ));
        }
        if !unexpected_reject.is_empty() {
            report.push(format!(
                "[{name}] n_* files pinned as lenient but rejected by the Rust port ({}); \
                 the pin records what the canonical TypeScript implementation accepts, \
                 so this is a TS/Rust divergence:\n  {}",
                unexpected_reject.len(),
                unexpected_reject.join("\n  ")
            ));
        }

        i_accepted.sort();
        if i_accepted != want_i_accepted {
            report.push(format!(
                "[{name}] i_* accepted set diverged from test/known-lenient.json\n  got  ({}): {}\n  want ({}): {}",
                i_accepted.len(),
                i_accepted.join(" "),
                want_i_accepted.len(),
                want_i_accepted.join(" ")
            ));
        }
    }

    assert!(report.is_empty(), "{}", report.join("\n\n"));
}
