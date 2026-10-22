// A parse from a reader (`Tabnas::parse_reader`, admin ADR-30). `make()`
// declares `lex.window`, so a reader is read a window at a time. Every row
// of the shared fixtures parses from a reader, handed over three bytes at a
// time, to the row's expected value, as `parity_test.rs` parses its text,
// and a long document parses the same both ways.

mod common;

use std::io::Read;

use tabnas_support::{parse_expect, Runner, Value};

use common::{options_from_cell, parser_for, spec_dir, to_failure, to_value, unescape_jsonc};

/// A reader that hands its bytes over at most `size` at a time.
struct Pieces<'a> {
    bytes: &'a [u8],
    at: usize,
    size: usize,
}

impl Read for Pieces<'_> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let n = self.size.min(buf.len()).min(self.bytes.len() - self.at);
        buf[..n].copy_from_slice(&self.bytes[self.at..self.at + n]);
        self.at += n;
        Ok(n)
    }
}

#[test]
fn make_reads_a_reader_a_window_at_a_time() {
    assert!(tabnas_jsonc::make().options.lex.window);
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
        let reader = Pieces {
            bytes: input.as_bytes(),
            at: 0,
            size: 3,
        };
        parser_for(options)
            .parse_reader(reader)
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
    let reader = Pieces {
        bytes: text.as_bytes(),
        at: 0,
        size: 4096,
    };
    let read = parser
        .parse_reader(reader)
        .expect("the reader parses")
        .to_string();
    assert_eq!(read, whole);
}
