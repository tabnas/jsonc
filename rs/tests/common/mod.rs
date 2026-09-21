// Shared test helpers. Cargo compiles this module into EVERY integration
// test binary, so an item only one binary uses is dead code in the
// others; the allow keeps that from being a warning rather than hiding
// anything real.
#![allow(dead_code)]

use std::path::{Path, PathBuf};

use tabnas::Tabnas;
use tabnas_jsonc::{make_with, JsoncOptions};
use tabnas_support::{find_spec_dir, Failure, Value};

/// The repository root: the parent of `rs/`.
pub fn repo_root() -> &'static Path {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("rs/ has a parent")
}

/// The shared `test/spec` directory, found by walking up from the crate
/// rather than by counting `..` hops.
pub fn spec_dir() -> PathBuf {
    find_spec_dir(Some(Path::new(env!("CARGO_MANIFEST_DIR"))))
        .expect("a test/spec directory above rs/")
}

/// An engine value as the fixture data model.
///
/// Trivia-only input yields no value at all, which the fixtures spell
/// `UNDEFINED`. The Rust engine folds a top-level undefined into `Null`
/// at the end of every parse (see ../../DIVERGENCE.md), so a parse result
/// never carries `Undefined` and the first branch below is a guard rather
/// than a path a fixture takes; `parity_test.rs` reads an `UNDEFINED`
/// cell as `null`, as the Go runner reads it as `nil`. Everything goes
/// through JSON, which is the flattening `go/parity_test.go` applies
/// (`jsonFlatten`): a `MapRef` or `ListRef` becomes its plain value.
pub fn to_value(value: &tabnas::Value) -> Value {
    if value.is_undefined() {
        Value::Undefined
    } else {
        Value::from(value.to_json())
    }
}

/// A parse error as the runner's failure: the code the fixture pins, and
/// the rendered report for the failure message.
pub fn to_failure(error: tabnas::TabnasError) -> Failure {
    Failure::new(error.code.clone())
        .at(error.row, error.col)
        .with_message(error.to_string())
}

/// The one thing this suite does not take from the shared runner: its
/// own escape codec, because jsonc's fixtures need a sixth escape.
///
/// A raw NUL inside a string must be rejected as `unprintable`, and a NUL
/// cannot be written literally in a .tsv (git would call the file
/// binary). The shared codec passes `\0` through unchanged on purpose (a
/// fixture has to be able to carry a literal backslash-zero), so decoding
/// it has to happen here, in one pass over the RAW cell. Two passes
/// cannot work: after the shared codec, `\0` from `\0` and `\0` from
/// `\\0` are the same two characters.
///
/// Kept byte-identical to `unescapeJsonc` in `ts/test/parity.test.ts`
/// and `specUnescape` in `go/parity_test.go`.
pub fn unescape_jsonc(cell: &str) -> String {
    if !cell.contains('\\') {
        return cell.to_string();
    }
    let mut out = String::with_capacity(cell.len());
    let mut chars = cell.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\\' {
            let decoded = match chars.peek() {
                Some('n') => Some('\n'),
                Some('r') => Some('\r'),
                Some('t') => Some('\t'),
                Some('0') => Some('\0'),
                Some('\\') => Some('\\'),
                _ => None,
            };
            if let Some(decoded) = decoded {
                chars.next();
                out.push(decoded);
                continue;
            }
        }
        out.push(c);
    }
    out
}

/// The plugin options a fixture row's `opts` cell names: an empty cell
/// means the defaults, anything else is a JSON object of the TypeScript
/// option keys. A cell that is not JSON is an error, never a default.
pub fn options_from_cell(cell: &str) -> Result<JsoncOptions, String> {
    if cell.trim().is_empty() {
        return Ok(JsoncOptions::default());
    }
    let bag: serde_json::Value = serde_json::from_str(cell)
        .map_err(|error| format!("opts cell is not JSON: {error}: {cell}"))?;
    Ok(JsoncOptions::from_value(&tabnas::Value::from_json(&bag)))
}

/// A fresh parser for one fixture row: the `opts` column is per-case,
/// and plugin options must not leak from one row into the next.
pub fn parser_for(options: JsoncOptions) -> Tabnas {
    make_with(options)
}
