// Copyright (c) 2021-2026 Richard Rodger, MIT License

// The engine's error carries a code, position, hint and a formatted
// report, so it is large by design and `Result<_, TabnasError>` trips
// clippy's `result_large_err`. The engine allows the lint at its own
// crate root for the same reason, and so does tabnas-jsonic; boxing here
// would make `parse` return a different shape from `Tabnas::parse` and
// from `tabnas_jsonic::parse`.
#![allow(clippy::result_large_err)]

//! A JSONC (JSON with comments) grammar plugin for the `tabnas` parsing
//! engine.
//!
//! JSONC is the dialect of editor and tool configuration files
//! (`tsconfig.json`, `settings.json`): standard JSON plus single-line
//! (`//`) and block (`/* */`) comments, with optional trailing commas in
//! objects and arrays.
//!
//! The plugin is not standalone. It layers on the relaxed-JSON grammar of
//! [`tabnas_jsonic`] (the `val` / `map` / `list` / `pair` / `elem` rules)
//! and adds no rules of its own: it installs an end-of-input alternate on
//! `val`, the trailing-comma alternates on `pair` and `elem`, and pulls
//! the lexer, number, string and map options back toward standard JSON.
//! Two plugin options switch behaviour: [`JsoncOptions::disallow_comments`]
//! (strict JSON, no comments) and [`JsoncOptions::allow_trailing_comma`].
//! Nesting is bounded at [`DEPTH_LIMIT`] levels, which the canonical
//! plugin does not do; see that constant for why.
//!
//! ```
//! let value = tabnas_jsonc::parse(r#"{ "foo": /* hello */ true }"#)?;
//! assert_eq!(value.to_string(), r#"{"foo":true}"#);
//! # Ok::<(), tabnas_jsonc::JsoncError>(())
//! ```
//!
//! This is the Rust port; the TypeScript package (`ts/src/jsonc.ts`) is
//! canonical and the Go port (`go/jsonc.go`) is the nearer structural
//! model. The grammar itself is authored once, in `jsonc-grammar.jsonic`
//! at the repository root, and embedded verbatim into all three runtimes.
//! The shared `test/spec/*.tsv` fixtures are the parity contract.

use std::sync::OnceLock;

use serde_json::Value as JsonValue;
use tabnas::{
    Context, GrammarError, GrammarSetting, GrammarSpec, Plugin, PluginError, Tabnas, Value,
};

/// The README's Rust examples run as doctests, so a stale one fails the
/// gate rather than misleading the reader. Its `toml` and `bash` fences
/// are skipped; rustdoc runs only the `rust` ones.
#[cfg(doctest)]
#[doc = include_str!("../README.md")]
mod readme_examples {}

/// This crate's version. It MUST equal `ts/package.json` "version": the
/// release orchestrator rewrites both, and `tests/version_test.rs` fails
/// the build if they drift. Mirrors `VERSION` in `ts/src/jsonc.ts` and
/// `const VERSION` in `go/jsonc.go`.
pub const VERSION: &str = "0.5.8";

/// The error a failed parse produces, re-exported so callers need not
/// depend on the engine crate directly. Every code jsonc raises is
/// inherited from the engine or from jsonic; the plugin declares none of
/// its own.
pub use tabnas::TabnasError as JsoncError;

/// The name the plugin registers under, and so the namespace of its
/// option bag on the engine. Mirrors the TypeScript plugin function name
/// `Jsonc`, which is what the engine records in its plugin stack.
pub const PLUGIN_NAME: &str = "Jsonc";

// --- BEGIN EMBEDDED jsonc-grammar.jsonic ---
const GRAMMAR_TEXT: &str = r##"
# JSONC Grammar Definition
# Parsed by a standard Jsonic instance and passed to jsonic.grammar()
# Extends standard JSON grammar with end-of-input value handling.

{
  options: text: { lex: false }
  options: number: { hex: false oct: false bin: false sep: null exclude: "@/^\\./" }
  options: string: { chars: '"' multiChars: '' allowUnknown: false escapeStrict: true }
  options: string: escape: { v: null }
  options: comment: def: hash: { lex: false }
  options: map: { extend: false }
  options: lex: { empty: false }
  options: rule: { finish: false }

  rule: val: open: {
    alts: [
      { s: '#ZZ' g: jsonc }
    ]
    inject: { append: true }
  }

  rule: pair: close: {
    alts: [
      { s: '#CA #CB' b: 1 g: comma }
    ]
    inject: {}
  }

  rule: elem: close: {
    alts: [
      { s: '#CA #CS' b: 1 g: comma }
    ]
    inject: {}
  }
}
"##;
// --- END EMBEDDED jsonc-grammar.jsonic ---

/// The embedded grammar text, exactly as `jsonc-grammar.jsonic` holds it
/// (with the leading newline the embedding adds). It is jsonic, not JSON:
/// the plugin parses it with a jsonic instance at install time, as the
/// TypeScript and Go plugins do, so the file at the repository root stays
/// the single source of truth for every runtime.
pub fn grammar_text() -> &'static str {
    GRAMMAR_TEXT
}

/// The plugin options. Mirrors the TypeScript `JsoncOptions` type and the
/// `pluginOpts` map the Go `Jsonc` reads; both keys are off by default.
///
/// ```
/// use tabnas_jsonc::JsoncOptions;
///
/// let options = JsoncOptions::new().with_allow_trailing_comma(true);
/// let parser = tabnas_jsonc::make_with(options);
/// assert_eq!(parser.parse("[1, 2, ]")?.to_string(), "[1,2]");
/// # Ok::<(), tabnas_jsonc::JsoncError>(())
/// ```
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct JsoncOptions {
    /// Accept a trailing comma before a closing `}` or `]`. Off, the
    /// `comma` alternates are excluded from the grammar and `[1,]` is
    /// rejected, which is what the JSONC dialect specifies by default.
    pub allow_trailing_comma: bool,

    /// Reject `//` and `/* */` comments, leaving strict JSON (plus the
    /// number and key relaxations jsonic keeps; see the README).
    pub disallow_comments: bool,
}

impl JsoncOptions {
    /// The default options: comments on, trailing commas off.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set [`JsoncOptions::allow_trailing_comma`].
    pub fn with_allow_trailing_comma(mut self, allow: bool) -> Self {
        self.allow_trailing_comma = allow;
        self
    }

    /// Set [`JsoncOptions::disallow_comments`].
    pub fn with_disallow_comments(mut self, disallow: bool) -> Self {
        self.disallow_comments = disallow;
        self
    }

    /// Read the options out of an engine plugin option bag, the shape
    /// [`Tabnas::use_plugin`] hands the plugin: `allowTrailingComma` and
    /// `disallowComments`, each on only when it is exactly `true`, as the
    /// Go `toBool` reads them. Anything else in the bag is ignored.
    pub fn from_value(value: &Value) -> Self {
        let bag = value.to_json();
        let flag = |name: &str| bag.get(name).and_then(JsonValue::as_bool).unwrap_or(false);
        Self {
            allow_trailing_comma: flag("allowTrailingComma"),
            disallow_comments: flag("disallowComments"),
        }
    }

    /// The options as an engine plugin option bag, with the TypeScript
    /// key names, for [`Tabnas::use_plugin`].
    pub fn to_value(&self) -> Value {
        Value::from_json(&serde_json::json!({
            "allowTrailingComma": self.allow_trailing_comma,
            "disallowComments": self.disallow_comments,
        }))
    }
}

/// The deepest nesting of objects and arrays a document may have.
///
/// This port's one deliberate departure from the canonical TypeScript
/// plugin, which sets no limit. The Rust engine's cost per rule grows
/// with the height of its rule stack, so a parse costs time quadratic in
/// the nesting depth: measured in a debug build, 100 levels cost 0.07 s
/// and 500 levels 1.6 s, so the RFC 8259 corpus's
/// `n_structure_100000_opening_arrays` would take hours to reject. The
/// engine's parse budget stops such a document at the limit with the
/// `cancel` code instead.
///
/// The limit is also what keeps a deep document from ending the process.
/// [`Value::to_json`] RECURSES once per level, about 2.2 KiB of stack per
/// level in a debug build, and a thread created with the standard library
/// default gets 2 MiB: measured, that stack aborts somewhere between 920
/// and 950 levels, and an abort cannot be caught. So the limit has to sit
/// below what the smallest realistic caller can walk, not merely below
/// what the engine can parse.
///
/// That leaves a narrow band, and 512 sits in it. The conformance pin in
/// `test/known-lenient.json` requires the corpus's 500-level
/// `i_structure_500_nested_arrays` to be ACCEPTED, which is the floor;
/// the stack is the ceiling. JSONC is the dialect of editor and tool
/// configuration, which nests a handful of levels, so the band is
/// generous for the format even though it is narrow in the abstract.
/// Recorded in `DIVERGENCE.md` at the repository root;
/// `tests/jsonc_test.rs` measures both the parse boundary and the walk of
/// a limit-deep value on a 2 MiB stack.
pub const DEPTH_LIMIT: usize = 512;

/// How many containers are open at this point in the parse.
///
/// Counted from the RULE NAMES rather than from `rule_stack.len()`. The
/// stack holds about three rules per level (`val`, then `map`/`list`,
/// then `pair`/`elem`), so a length-based limit would encode that ratio
/// and shift silently the first time the grammar gains an alternate.
/// Counting the container rules is the depth a reader of the document
/// would count. The rule the loop is working on is not in `rule_stack`
/// (the engine hands it over separately as `context.rule`), and a
/// container is open from the moment it is that rule, so it is counted
/// too. This is the shape `tabnas_json` uses for its own limit.
fn depth(context: &Context) -> usize {
    let is_container = |name: &str| name == "map" || name == "list";
    let ancestors = context
        .rule_stack
        .iter()
        .filter(|rule| is_container(&rule.name))
        .count();
    let current = usize::from(
        context
            .rule
            .as_ref()
            .is_some_and(|rule| is_container(&rule.name)),
    );
    ancestors + current
}

/// The parse budget: `DEPTH_LIMIT` levels parse, the next one does not.
fn within_depth_limit(context: &Context) -> bool {
    depth(context) <= DEPTH_LIMIT
}

/// The serialized `@/pattern/flags` regular expression reference, as a
/// bare pattern for the `regex` crate.
///
/// The grammar text spells `number.exclude` in the reference form the
/// three runtimes share. The TypeScript and Go engines resolve that form
/// wherever it appears in an option document; the Rust engine takes
/// `number.exclude` as the pattern itself, so the reference is unwrapped
/// here, before the document is installed. The JavaScript flags with a
/// `regex` counterpart travel as an inline group; `g`, `u` and `y` mean
/// nothing to a single anchored match and are dropped.
fn bare_pattern(source: &str) -> Option<String> {
    let body = source.strip_prefix("@/")?;
    let slash = body.rfind('/')?;
    let (pattern, flags) = (&body[..slash], &body[slash + 1..]);
    let flags: String = flags
        .chars()
        .filter(|flag| matches!(flag, 'i' | 'm' | 's'))
        .collect();
    Some(if flags.is_empty() {
        pattern.to_string()
    } else {
        format!("(?{flags}){pattern}")
    })
}

/// Put whole-valued numbers back as integers.
///
/// jsonic's value model has one number type, `f64`, so the `b: 1` of a
/// backtrack count comes out of the parse as `1.0`, and the engine's
/// document reader rightly refuses a float where it wants a count. The
/// TypeScript and Go runtimes never see the question: a JavaScript
/// number is a JavaScript number, and the Go reader accepts a whole
/// `float64`. Only finite numbers with no fractional part change.
fn integers(document: &mut JsonValue) {
    match document {
        JsonValue::Number(number) => {
            if let Some(float) = number.as_f64() {
                if float.is_finite() && float.fract() == 0.0 && float.abs() < 9.0e15 {
                    *number = serde_json::Number::from(float as i64);
                }
            }
        }
        JsonValue::Array(items) => items.iter_mut().for_each(integers),
        JsonValue::Object(entries) => entries.values_mut().for_each(integers),
        _ => {}
    }
}

/// Unwrap the one regular expression reference the grammar carries; see
/// [`bare_pattern`]. A document without it is left alone.
fn resolve_number_exclude(document: &mut JsonValue) {
    if let Some(exclude) = document.pointer_mut("/options/number/exclude") {
        if let Some(pattern) = exclude.as_str().and_then(bare_pattern) {
            *exclude = JsonValue::String(pattern);
        }
    }
}

/// The embedded grammar as the engine's serialized document.
///
/// The text is jsonic, so it is parsed by a jsonic instance, exactly the
/// `new Tabnas().use(jsonic).parse(grammarText)` of the TypeScript plugin
/// and the `GrammarText` of the Go one; the shared default jsonic parser
/// serves, since the text is fixed. The result is converted once and
/// cached: every install of the plugin, on every instance, reads the same
/// document.
fn grammar_document() -> Result<&'static JsonValue, GrammarError> {
    static DOCUMENT: OnceLock<Result<JsonValue, GrammarError>> = OnceLock::new();
    DOCUMENT
        .get_or_init(|| {
            let parsed = tabnas_jsonic::parse(GRAMMAR_TEXT).map_err(|error| {
                GrammarError(format!(
                    "tabnas-jsonc: the embedded jsonc-grammar.jsonic does not parse as jsonic: {error}"
                ))
            })?;
            let mut document = parsed.to_json();
            integers(&mut document);
            resolve_number_exclude(&mut document);
            Ok(document)
        })
        .as_ref()
        .map_err(Clone::clone)
}

/// Install JSONC on an engine that ALREADY carries the jsonic grammar:
/// the body of the TypeScript `Jsonc(tn, options)` plugin function and
/// the Go `Jsonc(j, pluginOpts)`.
///
/// In order, as they do: the embedded grammar is installed with every
/// alternate tagged `jsonc` (the static options, the `#ZZ` alternate on
/// `val.open`, the `comma` alternates on `pair.close` and `elem.close`),
/// and then the two argument-dependent options are applied on top:
/// `comment.lex` from `disallow_comments`, and `rule.include` of
/// `jsonc,json` with `rule.exclude` of `comma` unless
/// `allow_trailing_comma` keeps the trailing-comma alternates active.
///
/// The order matters: installing a grammar re-applies its own options,
/// so the runtime ones go on afterwards, where nothing can clobber them.
///
/// ```
/// let mut parser = tabnas::Tabnas::new();
/// tabnas_jsonic::jsonic(&mut parser)?;
/// tabnas_jsonc::jsonc(&mut parser, &tabnas_jsonc::JsoncOptions::new())?;
/// assert_eq!(parser.parse("[1, /* two */ 2]")?.to_string(), "[1,2]");
/// assert!(parser.parse("[1, 2, ]").is_err());
/// # Ok::<(), Box<dyn std::error::Error>>(())
/// ```
///
/// An engine without the jsonic rules is reported as a [`GrammarError`]
/// that names the repair, rather than growing alternates on rules that
/// do not exist. Prefer [`plugin`] with [`Tabnas::use_plugin`] when the
/// instance may be derived from: a plugin installed that way is re-run on
/// the derived instance.
pub fn jsonc(parser: &mut Tabnas, options: &JsoncOptions) -> Result<(), GrammarError> {
    if !parser.rule_names().iter().any(|name| name == "val") {
        return Err(GrammarError(
            "tabnas-jsonc: the jsonic grammar must be installed first: \
             call tabnas_jsonic::jsonic(&mut parser) before tabnas_jsonc::jsonc(...), \
             or use make()"
                .into(),
        ));
    }

    let comment_lex = !options.disallow_comments;
    let rule_exclude = if options.allow_trailing_comma {
        ""
    } else {
        "comma"
    };

    // Apply the grammar: static options, and the end-of-input and
    // trailing-comma alternates, every one tagged `jsonc`.
    let spec = GrammarSpec::from_value(grammar_document()?.clone())?;
    parser.grammar_with_setting(&spec, &GrammarSetting::groups("jsonc"))?;

    // Runtime options that depend on plugin arguments.
    parser
        .set_options(|engine| {
            engine.comment.lex = comment_lex;
            engine.rule.include = "jsonc,json".into();
            engine.rule.exclude = rule_exclude.into();
        })
        .map_err(|error| GrammarError(error.0))?;

    // LAST, after both the grammar and the options pass: each applies
    // its own options, and a pass that does not mention `parse.budget`
    // is not required to keep one set earlier. Checked every iteration,
    // because the check is what bounds the engine's quadratic cost on a
    // deeply nested source; a sampled check would let the parse run past
    // the limit by however many levels the sample missed.
    parser.parse_budget(1, within_depth_limit);

    Ok(())
}

/// The plugin form of [`jsonc`], for [`Tabnas::use_plugin`]: the Rust
/// counterpart of `tn.use(Jsonc, options)` and `j.Use(Jsonc, opts)`.
///
/// The option bag is the TypeScript one, `allowTrailingComma` and
/// `disallowComments`, read through [`JsoncOptions::from_value`]; both
/// default to off. Installed this way the plugin is re-applied to derived
/// instances, as every native plugin is.
///
/// ```
/// let mut parser = tabnas_jsonic::make();
/// let options = tabnas_jsonc::JsoncOptions::new().with_disallow_comments(true);
/// parser.use_plugin(tabnas_jsonc::plugin(), Some(options.to_value()))?;
/// assert_eq!(parser.parse(r#"{"a":[1,2]}"#)?.to_string(), r#"{"a":[1,2]}"#);
/// assert!(parser.parse("[1] // no comments").is_err());
/// # Ok::<(), Box<dyn std::error::Error>>(())
/// ```
pub fn plugin() -> Plugin {
    Plugin::new(PLUGIN_NAME, |parser, options| {
        jsonc(parser, &JsoncOptions::from_value(options)).map_err(|error| PluginError(error.0))
    })
    .with_defaults(JsoncOptions::default().to_value())
}

/// Build a JSONC parser with the given options: a jsonic instance with
/// the plugin installed through [`Tabnas::use_plugin`], which is the
/// `new Tabnas().use(jsonic).use(Jsonc, options)` of the TypeScript
/// suite and the `jsonic.Make()` then `j.Use(Jsonc, opts)` of the Go one.
///
/// Infallible by design: the grammar text is fixed and the jsonic base is
/// installed one line earlier, so a failure here is a bug in this crate
/// rather than anything a caller did.
///
/// ```
/// let parser = tabnas_jsonc::make_with(
///     tabnas_jsonc::JsoncOptions::new().with_allow_trailing_comma(true),
/// );
/// assert_eq!(parser.parse(r#"{ "hello": [], }"#)?.to_string(), r#"{"hello":[]}"#);
/// # Ok::<(), tabnas_jsonc::JsoncError>(())
/// ```
pub fn make_with(options: JsoncOptions) -> Tabnas {
    let mut parser = tabnas_jsonic::make();
    parser
        .use_plugin(plugin(), Some(options.to_value()))
        .expect("the embedded jsonc grammar is fixed and installs on a fresh jsonic instance");
    parser
}

/// Build a JSONC parser with the default options: comments on, trailing
/// commas off.
///
/// ```
/// let parser = tabnas_jsonc::make();
/// assert_eq!(parser.parse("// a comment\n[1, 2]")?.to_string(), "[1,2]");
/// assert_eq!(parser.parse("[1, 2, ]").unwrap_err().code, "unexpected");
/// # Ok::<(), tabnas_jsonc::JsoncError>(())
/// ```
pub fn make() -> Tabnas {
    make_with(JsoncOptions::default())
}

/// Parse a JSONC source string with the shared default parser.
///
/// The engine is built once, on first use, and reused after that; reuse
/// is safe because [`Tabnas::parse`] takes `&self` and builds a fresh
/// parse context per call, and `Tabnas` is `Send + Sync`. Building the
/// grammar dominates a small parse, so this is what a caller with no
/// options should use. The TypeScript package and the Go module have no
/// package-level parse of their own; this one is the Rust convenience the
/// sibling crates all offer.
///
/// Use [`make`] or [`make_with`] instead when the parser needs
/// configuring: that returns a fresh instance and leaves this one alone.
///
/// A document that holds only trivia (whitespace and comments) has no
/// value. The TypeScript plugin returns `undefined` for it; the Rust
/// engine folds a top-level undefined into `Value::Null` at the end of
/// every parse, so here it is `null`, which is also what the Go port's
/// `nil` serializes as.
///
/// ```
/// let value = tabnas_jsonc::parse(r#"{ "a": 1, /* one */ "b": [2] }"#)?;
/// assert_eq!(value.to_string(), r#"{"a":1,"b":[2]}"#);
/// assert_eq!(tabnas_jsonc::parse("// only a comment")?, tabnas::Value::Null);
/// # Ok::<(), tabnas_jsonc::JsoncError>(())
/// ```
pub fn parse(src: &str) -> Result<Value, JsoncError> {
    static DEFAULT: OnceLock<Tabnas> = OnceLock::new();
    DEFAULT.get_or_init(make).parse(src)
}
