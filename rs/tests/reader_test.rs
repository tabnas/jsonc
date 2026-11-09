// A parse from a reader (`Tabnas::parse_reader`, admin ADR-30). `make()`
// declares `lex.window`, so a reader is read a window at a time: every
// token of the grammar, jsonic's base included, is cut by the engine's own
// matchers, and its one hook, `number.exclude`, judges a number the number
// matcher has already cut.
//
// Every row of the shared fixtures parses from a reader to the row's
// expected value. Every row, and every document of the JSONTestSuite corpus
// in each of the three modes, parses the same from a reader, in pieces of
// 1, 3 and 64 bytes, under windows of a few characters as well as the
// engine's own, as from its text: the same value, or the same error code,
// position, row, column and token text; a corpus document that is not UTF-8
// a reader refuses as `unreadable`. Tokens longer than the window, and a
// long document read under a window of 256 characters that moves on
// hundreds of times, parse the same too.

mod common;

use std::fs;
use std::io::Read;
use std::path::PathBuf;

use tabnas::{Tabnas, WindowSizes};
use tabnas_jsonc::{make_with, JsoncOptions};
use tabnas_support::{load_spec_dir, parse_expect, Runner, SpecOptions, Value};

use common::{
    options_from_cell, parser_for, repo_root, spec_dir, to_failure, to_value, unescape_jsonc,
};

/// A reader that hands its bytes over at most `size` at a time.
struct Pieces<'a> {
    bytes: &'a [u8],
    at: usize,
    size: usize,
}

impl<'a> Pieces<'a> {
    fn new(bytes: &'a [u8], size: usize) -> Self {
        Pieces { bytes, at: 0, size }
    }
}

impl Read for Pieces<'_> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let n = self.size.min(buf.len()).min(self.bytes.len() - self.at);
        buf[..n].copy_from_slice(&self.bytes[self.at..self.at + n]);
        self.at += n;
        Ok(n)
    }
}

/// What a parse shows: its value, or its error's code, position, row,
/// column and token text. An error's excerpt is left out: a parse from a
/// reader shows a long line only as far back as the window reaches
/// (tabnas/parser `DIVERGENCE.md`), the one difference allowed.
fn outcome(parsed: Result<tabnas::Value, tabnas::TabnasError>) -> String {
    match parsed {
        Ok(value) => format!("ok {value:?}"),
        Err(e) => format!(
            "err {} at {} {}:{} {:?}",
            e.code, e.pos, e.row, e.col, e.src
        ),
    }
}

/// The first `n` bytes of `s`, cut back to a character boundary.
fn cut(s: &str, n: usize) -> &str {
    let mut end = n.min(s.len());
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

/// The pieces a short document is handed over in, and the windows (margin
/// and block, in characters) it is read under besides the engine's own: a
/// few characters, so that every matcher meets the window's edge.
const PIECES: [usize; 3] = [1, 3, 64];
const WINDOWS: [(usize, usize); 3] = [(1, 1), (3, 2), (64, 64)];

/// `text` parsed by `parser` whole, and from a reader: a short one in each
/// of [`PIECES`] under the engine's window and each of [`WINDOWS`], one
/// over 512 bytes once, in pieces of 4096 bytes, under the engine's
/// window. Those are three of the corpus, each nested
/// 500 levels deep or more, whose every parse costs most of a second in a
/// debug build, for the nesting and not the window. How many reader parses
/// were compared, and where they differ.
fn same_from_reader(parser: &Tabnas, at: &str, text: &str) -> (usize, Vec<String>) {
    let whole = outcome(parser.parse(text));
    let bytes = text.as_bytes();
    let mut reads: Vec<(String, String)> = Vec::new();
    if bytes.len() > 512 {
        reads.push((
            "pieces of 4096".to_string(),
            outcome(parser.parse_reader(Pieces::new(bytes, 4096))),
        ));
    } else {
        for size in PIECES {
            reads.push((
                format!("pieces of {size}"),
                outcome(parser.parse_reader(Pieces::new(bytes, size))),
            ));
            for (margin, block) in WINDOWS {
                let sizes = WindowSizes {
                    margin,
                    block,
                    chunk: size,
                };
                reads.push((
                    format!("pieces of {size}, margin {margin}, block {block}"),
                    outcome(parser.parse_reader_with_sizes(Pieces::new(bytes, size), sizes)),
                ));
            }
        }
    }
    let failures = reads
        .iter()
        .filter(|(_, read)| *read != whole)
        .map(|(how, read)| {
            format!(
                "{at}: {:?} from a reader in {how}\n  whole:  {}\n  reader: {}",
                cut(text, 80),
                cut(&whole, 200),
                cut(read, 200)
            )
        })
        .collect();
    (reads.len(), failures)
}

#[test]
fn make_reads_a_reader_a_window_at_a_time() {
    assert!(tabnas_jsonc::make().options.lex.window);
    // The plugin alone declares nothing: a host may install it beneath
    // matchers of its own.
    let mut parser = tabnas_jsonic::make();
    parser
        .use_plugin(tabnas_jsonc::plugin(), None)
        .expect("the plugin installs");
    assert!(!parser.options.lex.window);
}

/// The shared fixtures, each row's input from a reader.
#[test]
fn spec_from_a_reader() {
    Runner::new_with_row(|_input, row| {
        let input = unescape_jsonc(row.named("input"));
        let options = match options_from_cell(row.named("opts")) {
            Ok(options) => options,
            Err(error) => return Ok(Value::String(format!("NOT-A-PARSE-ERROR: {error}"))),
        };
        parser_for(options)
            .parse_reader(Pieces::new(input.as_bytes(), 3))
            .map(|value| to_value(&value))
            .map_err(to_failure)
    })
    .parse_expected(|expected, _row| {
        if expected == "UNDEFINED" {
            Ok(Value::Null)
        } else {
            parse_expect(expected)
        }
    })
    .dir(spec_dir());
}

/// Every row of the shared fixtures, under its options, parses the same
/// from a reader as from its text.
#[test]
fn every_row_parses_the_same_from_a_reader() {
    let specs = load_spec_dir(spec_dir(), &SpecOptions::default())
        .unwrap_or_else(|error| panic!("{error}"));
    let mut compared = 0;
    let mut failures = Vec::new();
    for spec in &specs {
        for row in &spec.rows {
            let options = options_from_cell(row.named("opts"))
                .unwrap_or_else(|error| panic!("{}: {error}", row.location()));
            let (count, found) = same_from_reader(
                &parser_for(options),
                &row.location(),
                &unescape_jsonc(row.named("input")),
            );
            compared += count;
            failures.extend(found);
        }
    }
    assert!(compared > 1_000, "{compared}");
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

fn corpus_dir() -> PathBuf {
    repo_root()
        .join("test")
        .join("JSONTestSuite")
        .join("test_parsing")
}

/// Every document of the JSONTestSuite corpus that is UTF-8 parses the same
/// from a reader as from its text, in each of the three modes; one that is
/// not, a reader refuses as `unreadable`.
#[test]
fn the_corpus_parses_the_same_from_a_reader() {
    let mut files: Vec<String> = fs::read_dir(corpus_dir())
        .expect("the corpus is vendored")
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.ends_with(".json"))
        .collect();
    files.sort();
    let modes = [
        ("strict", JsoncOptions::new().with_disallow_comments(true)),
        ("comments", JsoncOptions::new()),
        (
            "trailing-comma",
            JsoncOptions::new().with_allow_trailing_comma(true),
        ),
    ];
    let mut compared = 0;
    let mut refused = 0;
    let mut failures = Vec::new();
    for (n, (mode, options)) in modes.into_iter().enumerate() {
        let parser = make_with(options);
        for file in &files {
            let bytes = fs::read(corpus_dir().join(file)).expect("a corpus file reads");
            match std::str::from_utf8(&bytes) {
                Ok(text) => {
                    let (count, found) = same_from_reader(&parser, &format!("{mode} {file}"), text);
                    compared += count;
                    failures.extend(found);
                }
                Err(_) => {
                    refused += 1;
                    let read = outcome(parser.parse_reader(Pieces::new(&bytes, 3)));
                    if !read.starts_with("err unreadable ") {
                        failures.push(format!(
                            "{mode} {file}: from a reader {read}, not unreadable"
                        ));
                    }
                }
            }
        }
        eprintln!(
            "reader corpus: {} of 3 modes ({}%), {compared} reader parses",
            n + 1,
            (n + 1) * 100 / 3
        );
    }
    assert_eq!(refused, 3 * 25);
    assert!(compared > 10_000, "{compared}");
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

/// Tokens longer than the engine's window, which reaches 64 KiB past the
/// cursor before each token, parse the same from a reader as from their
/// text, in each mode.
#[test]
fn tokens_longer_than_the_window_parse_the_same_from_a_reader() {
    let long = 64 * 1024 + 2048;
    let documents = [
        format!("[\"{}\\u0041\"]", "s".repeat(long)),
        format!("[\"{}\"]", "\\n".repeat(long / 2)),
        format!("[1{}]", "0".repeat(long)),
        format!("[-1.{}e3, 2]", "5".repeat(long)),
        format!("[1, // {}\n2]", "c".repeat(long)),
        format!("[1, /* {} */ 2]", "b\n".repeat(long / 2)),
        format!("[1,{}2]", " ".repeat(long)),
        format!("[1,{}2]", "\n".repeat(long)),
        format!("[\"{}\u{1}\"]", "a".repeat(long)),
        format!("[\"{}", "a".repeat(long)),
        format!("[1, /* {}", "u".repeat(long)),
    ];
    let modes = [
        JsoncOptions::new().with_disallow_comments(true),
        JsoncOptions::new(),
        JsoncOptions::new().with_allow_trailing_comma(true),
    ];
    let mut failures = Vec::new();
    for options in modes {
        let parser = make_with(options);
        for (n, document) in documents.iter().enumerate() {
            let (_, found) = same_from_reader(&parser, &format!("document {n}"), document);
            failures.extend(found);
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn a_long_document_parses_the_same_from_a_reader() {
    let records: Vec<String> = (0..20_000)
        .map(|i| {
            format!("{{\"id\": {i}, \"name\": \"ñ{i}\" /* a comment */, \"tags\": [\"a\", \"b\"]}}")
        })
        .collect();
    let text = format!("// records\n[{}]", records.join(",\n"));
    let parser = tabnas_jsonc::make();
    let whole = parser.parse(&text).expect("the text parses").to_string();
    let read = parser
        .parse_reader(Pieces::new(text.as_bytes(), 4096))
        .expect("the reader parses")
        .to_string();
    assert_eq!(read, whole);
}

/// A long document under a window of 256 characters, which moves on
/// hundreds of times before the end, parses the same as its text; so does
/// the same document with an error at its end, which the reader places
/// where the whole text does.
#[test]
fn a_long_document_parses_the_same_under_a_small_window() {
    let records: Vec<String> = (0..2_500)
        .map(|i| {
            format!("{{\"id\": {i}, \"name\": \"ñ{i}\\u00e9\" /* note {i} */, \"tags\": [\"a\", \"b\"]}}")
        })
        .collect();
    let body = format!("// records\n[\n{}", records.join(",\n"));
    let text = format!("{body}\n]\n");
    let broken = format!("{body},\n\"tail\u{1}\"\n]\n");
    assert!(text.len() > 128 << 10, "{}", text.len());
    let parser = tabnas_jsonc::make();
    let small = WindowSizes {
        margin: 256,
        block: 256,
        chunk: 4096,
    };
    for (document, ok) in [(&text, true), (&broken, false)] {
        let whole = outcome(parser.parse(document));
        assert_eq!(whole.starts_with("ok "), ok, "{}", cut(&whole, 200));
        let read =
            outcome(parser.parse_reader_with_sizes(Pieces::new(document.as_bytes(), 4096), small));
        assert!(
            read == whole,
            "whole:  {}\nreader: {}",
            cut(&whole, 200),
            cut(&read, 200)
        );
    }
}
