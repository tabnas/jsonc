// In-language behaviour the shared fixtures cannot express, plus the
// port of go/jsonc_test.go (which mirrors ts/test/jsonc.test.ts,
// including the cases derived from microsoft/node-jsonc-parser; see
// THIRD_PARTY_NOTICES.md). Where a case is also a fixture row it stays
// here too, as it does in Go: the two suites cover the same ground.

mod common;

use std::sync::OnceLock;

use serde_json::{json, Value as Json};
use tabnas::{Tabnas, Value};
use tabnas_jsonc::{grammar_text, jsonc, make, make_with, parse, plugin, JsoncOptions};

use common::repo_root;

/// The shared default instance, built once, as `var j = makeJsonc()` in
/// the Go suite and the module-level instance in the TypeScript one.
fn shared() -> &'static Tabnas {
    static SHARED: OnceLock<Tabnas> = OnceLock::new();
    SHARED.get_or_init(make)
}

/// A parsed value as JSON, which is the flattening the Go `normalize` and
/// the TypeScript deep-equal both apply. The engine's numbers are `f64`,
/// and `serde_json` tells `1.0` from `1`, so a whole-valued number is put
/// back as the integer a `json!` literal spells it as; the value is the
/// same, as it is in JavaScript.
fn flatten(value: &Value) -> Json {
    fn integers(json: Json) -> Json {
        match json {
            Json::Number(number) => match number.as_f64() {
                Some(float) if float.fract() == 0.0 && float.abs() < 9.0e15 => {
                    Json::from(float as i64)
                }
                _ => Json::Number(number),
            },
            Json::Array(items) => Json::Array(items.into_iter().map(integers).collect()),
            Json::Object(entries) => Json::Object(
                entries
                    .into_iter()
                    .map(|(key, value)| (key, integers(value)))
                    .collect(),
            ),
            other => other,
        }
    }
    integers(value.to_json())
}

/// A parse on the shared instance, flattened.
fn ok(src: &str) -> Json {
    flatten(
        &shared()
            .parse(src)
            .unwrap_or_else(|error| panic!("{src:?} should parse: {error}")),
    )
}

/// The code a rejected parse carries; a parse that succeeds fails the
/// test, naming the value, the way the Go `assertError` does.
fn code(src: &str) -> String {
    match shared().parse(src) {
        Ok(value) => panic!("{src:?} should be rejected, but parsed to {value}"),
        Err(error) => error.code,
    }
}

/// A parse that must be rejected, with any code: the shape of the bare
/// `if err == nil { t.Error(...) }` checks in the Go suite.
fn rejects(parser: &Tabnas, src: &str) {
    if let Ok(value) = parser.parse(src) {
        panic!("{src:?} should be rejected, but parsed to {value}");
    }
}

fn accepts(parser: &Tabnas, src: &str, want: Json) {
    let got = flatten(
        &parser
            .parse(src)
            .unwrap_or_else(|error| panic!("{src:?} should parse: {error}")),
    );
    assert_eq!(got, want, "{src:?}");
}

#[test]
fn happy() {
    assert_eq!(ok(r#"{"a":1}"#), json!({"a": 1}));
}

#[test]
fn comments() {
    // Trivia-only input yields no value; the Rust engine reports that as
    // `null` (see ../../DIVERGENCE.md), which is what the Go suite's
    // `nil` expectations read as too.
    assert_eq!(ok("// this is a comment"), Json::Null);
    assert_eq!(ok("// this is a comment\n"), Json::Null);
    assert_eq!(ok("/* this is a comment*/"), Json::Null);
    assert_eq!(ok("/* this is a \r\ncomment*/"), Json::Null);
    assert_eq!(ok("/* this is a \ncomment*/"), Json::Null);

    assert_eq!(code("/* this is a"), "unterminated_comment");
    assert_eq!(code("/* this is a \ncomment"), "unterminated_comment");
    assert_eq!(code("/ ttt"), "unexpected");
}

#[test]
fn strings() {
    assert_eq!(ok(r#""test""#), json!("test"));
    assert_eq!(ok(r#""\"""#), json!("\""));
    assert_eq!(ok(r#""\/""#), json!("/"));
    assert_eq!(ok(r#""\b""#), json!("\u{8}"));
    assert_eq!(ok(r#""\f""#), json!("\u{c}"));
    assert_eq!(ok(r#""\n""#), json!("\n"));
    assert_eq!(ok(r#""\r""#), json!("\r"));
    assert_eq!(ok(r#""\t""#), json!("\t"));
    assert_eq!(ok(r#""Ü""#), json!("\u{DC}"));

    // Only the standard JSON escapes are accepted: \", \\, \/, \b, \f,
    // \n, \r, \t and \uXXXX. The non-JSON \v escape is removed via the
    // grammar's `string.escape.v: null`, and the non-JSON structural
    // escapes \xHH and \u{...} via `string.escapeStrict`. (Matches the
    // TypeScript side; also pinned cross-runtime in test/spec/strings.tsv.)
    for src in [r#""\v""#, r#""\x42""#, r#""\u{41}""#] {
        rejects(shared(), src);
    }

    assert_eq!(code(r#""test"#), "unterminated_string");
}

#[test]
fn numbers() {
    assert_eq!(ok("0"), json!(0));
    assert_eq!(ok("0.1"), json!(0.1));
    assert_eq!(ok("-0.1"), json!(-0.1));
    assert_eq!(ok("-1"), json!(-1));
    assert_eq!(ok("1"), json!(1));
    assert_eq!(ok("123456789"), json!(123456789));
    assert_eq!(ok("10"), json!(10));
    assert_eq!(ok("90"), json!(90));
    assert_eq!(ok("90E+123"), json!(90e123));
    assert_eq!(ok("90e+123"), json!(90e123));
    assert_eq!(ok("90e-123"), json!(90e-123));
    assert_eq!(ok("90E-123"), json!(90e-123));
    assert_eq!(ok("90E123"), json!(90e123));
    assert_eq!(ok("90e123"), json!(90e123));

    assert_eq!(code("-"), "unexpected");
    assert_eq!(code(".0"), "unexpected");
}

#[test]
fn keywords() {
    assert_eq!(ok("true"), json!(true));
    assert_eq!(ok("false"), json!(false));
    assert_eq!(ok("null"), Json::Null);
    assert_eq!(code("True"), "unexpected");
    assert_eq!(ok("false//hello"), json!(false));
}

#[test]
fn trivia() {
    for src in [
        " ",
        "  \t  ",
        "  \t  \n  \t  ",
        "\r\n",
        "\r",
        "\n",
        "\n\r",
        "\n   \n",
    ] {
        assert_eq!(ok(src), Json::Null, "{src:?}");
    }
}

#[test]
fn literals() {
    assert_eq!(ok("true"), json!(true));
    assert_eq!(ok("false"), json!(false));
    assert_eq!(ok("null"), Json::Null);
    assert_eq!(ok(r#""foo""#), json!("foo"));
    assert_eq!(
        ok(r#""\"-\\-\/-\b-\f-\n-\r-\t""#),
        json!("\"-\\-/-\u{8}-\u{c}-\n-\r-\t")
    );
    assert_eq!(ok(r#""Ü""#), json!("\u{DC}"));
    assert_eq!(ok("9"), json!(9));
    assert_eq!(ok("-9"), json!(-9));
    assert_eq!(ok("0.129"), json!(0.129));
    assert_eq!(ok("23e3"), json!(23000));
    assert_eq!(ok("1.2E+3"), json!(1200));
    assert_eq!(ok("1.2E-3"), json!(0.0012));
    assert_eq!(ok("1.2E-3 // comment"), json!(0.0012));
}

#[test]
fn objects() {
    assert_eq!(ok("{}"), json!({}));
    assert_eq!(ok(r#"{ "foo": true }"#), json!({"foo": true}));
    assert_eq!(
        ok(r#"{ "bar": 8, "xoo": "foo" }"#),
        json!({"bar": 8, "xoo": "foo"})
    );
    assert_eq!(
        ok(r#"{ "hello": [], "world": {} }"#),
        json!({"hello": [], "world": {}})
    );
    assert_eq!(
        ok(r#"{ "a": false, "b": true, "c": [ 7.4 ] }"#),
        json!({"a": false, "b": true, "c": [7.4]})
    );
    assert_eq!(
        ok(r#"{ "hello": { "again": { "inside": 5 }, "world": 1 }}"#),
        json!({"hello": {"again": {"inside": 5}, "world": 1}})
    );
    assert_eq!(ok(r#"{ "foo": /*hello*/true }"#), json!({"foo": true}));
    assert_eq!(ok(r#"{ "": true }"#), json!({"": true}));
}

#[test]
fn arrays() {
    assert_eq!(ok("[]"), json!([]));
    assert_eq!(ok("[ [],  [ [] ]]"), json!([[], [[]]]));
    assert_eq!(ok("[ 1, 2, 3 ]"), json!([1, 2, 3]));
    assert_eq!(ok(r#"[ { "a": null } ]"#), json!([{"a": null}]));
}

#[test]
fn object_errors() {
    for src in [
        "{,}",
        r#"{ "foo": true, }"#,
        r#"{ "bar": 8 "xoo": "foo" }"#,
        r#"{ ,"bar": 8 }"#,
        r#"{ "bar": 8, "foo": }"#,
        r#"{ 8, "foo": 9 }"#,
    ] {
        rejects(shared(), src);
    }
}

#[test]
fn array_errors() {
    for src in ["[,]", "[ 1 2, 3 ]", "[ ,1, 2, 3 ]", "[ ,1, 2, 3, ]"] {
        rejects(shared(), src);
    }
}

#[test]
fn errors() {
    rejects(shared(), "1,1");
    rejects(shared(), "");
}

#[test]
fn disallow_comments() {
    let strict = make_with(JsoncOptions::new().with_disallow_comments(true));
    accepts(
        &strict,
        r#"[ 1, 2, null, "foo" ]"#,
        json!([1, 2, null, "foo"]),
    );
    accepts(
        &strict,
        r#"{ "hello": [], "world": {} }"#,
        json!({"hello": [], "world": {}}),
    );
    rejects(&strict, r#"{ "foo": /*comment*/ true }"#);
}

#[test]
fn trailing_comma() {
    let lenient = make_with(JsoncOptions::new().with_allow_trailing_comma(true));
    accepts(&lenient, r#"{ "hello": [], }"#, json!({"hello": []}));
    accepts(&lenient, r#"{ "hello": [] }"#, json!({"hello": []}));
    accepts(
        &lenient,
        r#"{ "hello": [], "world": {}, }"#,
        json!({"hello": [], "world": {}}),
    );
    accepts(&lenient, "[ 1, 2, ]", json!([1, 2]));
    accepts(&lenient, "[ 1, 2 ]", json!([1, 2]));

    // The default parser rejects trailing commas.
    rejects(shared(), r#"{ "hello": [], }"#);
    rejects(shared(), "[ 1, 2, ]");
}

#[test]
fn misc() {
    assert_eq!(ok(r#"{ "foo": "bar" }"#), json!({"foo": "bar"}));
    assert_eq!(
        ok(r#"{ "foo": {"bar": 1, "car": 2 } }"#),
        json!({"foo": {"bar": 1, "car": 2}})
    );
    assert_eq!(
        ok(r#"{ "foo": {"bar": 1, "car": 8 }, "goo": {} }"#),
        json!({"foo": {"bar": 1, "car": 8}, "goo": {}})
    );
    rejects(shared(), r#"{ "dep": {"bar": 1, "car": "#);
    rejects(shared(), r#"{ "dep": {"bar": 1,, "car": "#);
    rejects(
        shared(),
        r#"{ "dep": {"bar": "na", "dar": "ma", "car":  } }"#,
    );
    assert_eq!(ok(r#"["foo", null ]"#), json!(["foo", null]));
    rejects(shared(), r#"["foo", null, ]"#);
    rejects(shared(), r#"["foo", null,, ]"#);
    assert_eq!(ok("true"), json!(true));
    assert_eq!(ok("false"), json!(false));
    assert_eq!(ok("null"), Json::Null);
    assert_eq!(ok("23"), json!(23));
    assert_eq!(ok("-1.93e-19"), json!(-1.93e-19));
    assert_eq!(ok(r#""hello""#), json!("hello"));
    assert_eq!(ok("[]"), json!([]));
    assert_eq!(ok("[ 1 ]"), json!([1]));
    assert_eq!(ok(r#"[ 1, "x"]"#), json!([1, "x"]));
    assert_eq!(ok("[[]]"), json!([[]]));
    assert_eq!(ok("{ }"), json!({}));
    assert_eq!(ok(r#"{ "val": 1 }"#), json!({"val": 1}));
    assert_eq!(
        ok(r#"{"id": "$", "v": [ null, null] }"#),
        json!({"id": "$", "v": [null, null]})
    );
    rejects(shared(), r#"{  "id": { "foo": { } } , }"#);
    assert_eq!(ok(r#"{ "foo": { "goo": 3 } }"#), json!({"foo": {"goo": 3}}));
    assert_eq!(ok("[\r\n0,\r\n1,\r\n2\r\n]"), json!([0, 1, 2]));
    assert_eq!(
        ok("/* g */ { \"foo\": //f\n\"bar\" }"),
        json!({"foo": "bar"})
    );
    assert_eq!(
        ok("/* g\r\n */ { \"foo\": //f\n\"bar\" }"),
        json!({"foo": "bar"})
    );
    assert_eq!(
        ok("/* g\n */ { \"foo\": //f\n\"bar\"\n}"),
        json!({"foo": "bar"})
    );
    assert_eq!(
        ok(
            r#"{ "key1": { "key11": [ "val111", "val112" ] }, "key2": [ { "key21": false, "key22": 221 }, null, [{}] ] }"#
        ),
        json!({
            "key1": {"key11": ["val111", "val112"]},
            "key2": [{"key21": false, "key22": 221}, null, [{}]],
        })
    );
}

/// The plugin installed through `use_plugin` yields an object for an
/// object document, the shape the Go `TestUsePlugin` asserts through its
/// `*jsonic.OrderedMap` check.
#[test]
fn use_plugin() {
    let mut parser = tabnas_jsonic::make();
    parser
        .use_plugin(plugin(), None)
        .expect("the plugin installs on a jsonic instance");
    let value = parser.parse(r#"{"a": 1, "b": "hello"}"#).expect("parses");
    assert!(
        matches!(value, Value::Object(_) | Value::MapRef(_)),
        "expected an object, got {value:?}"
    );
    assert_eq!(flatten(&value), json!({"a": 1, "b": "hello"}));
}

/// The grammar setting `{rule: {alt: {g: 'jsonc'}}}` tagged every
/// alternate the plugin installs with `jsonc`. Mirrors the Go
/// `TestAltGJsoncTag` and the TypeScript `alt g jsonc tag` case.
#[test]
fn alt_g_jsonc_tag() {
    // Fresh instance with allow_trailing_comma, as the other suites
    // build it, so the pair and elem close alternates are the ones a
    // parse would use.
    let parser = make_with(JsoncOptions::new().with_allow_trailing_comma(true));

    let signature = |alt: &tabnas::AltSpec| -> String {
        alt.s
            .iter()
            .map(|position| {
                position
                    .iter()
                    .map(|tin| parser.token_name(*tin))
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .collect::<Vec<_>>()
            .join(" ")
    };

    let checks = [
        ("val", true, "#ZZ"),
        ("pair", false, "#CA #CB"),
        ("elem", false, "#CA #CS"),
    ];
    for (rule, is_open, want_signature) in checks {
        let spec = parser
            .rule_specs()
            .into_iter()
            .find(|spec| spec.name == rule)
            .unwrap_or_else(|| panic!("rule {rule:?} missing"));
        let alts = if is_open { &spec.open } else { &spec.close };

        let tagged: Vec<&tabnas::AltSpec> = alts
            .iter()
            .filter(|alt| alt.g.split(',').any(|tag| tag.trim() == "jsonc"))
            .collect();
        assert!(
            !tagged.is_empty(),
            "rule {rule:?}: no alt with 'jsonc' tag found"
        );
        assert!(
            tagged.iter().any(|alt| signature(alt) == want_signature),
            "rule {rule:?}: no 'jsonc' alt matches {want_signature:?}; tagged: {:?}",
            tagged.iter().map(|alt| signature(alt)).collect::<Vec<_>>()
        );
    }

    // The trailing-comma alternates keep their own `comma` group beside
    // the setting's tag: that group is what `rule.exclude` names.
    for rule in ["pair", "elem"] {
        let spec = parser
            .rule_specs()
            .into_iter()
            .find(|spec| spec.name == rule)
            .expect("the rule exists");
        assert!(
            spec.close.iter().any(|alt| {
                let tags: Vec<&str> = alt.g.split(',').map(str::trim).collect();
                tags.contains(&"comma") && tags.contains(&"jsonc")
            }),
            "rule {rule:?}: no close alt tagged both comma and jsonc"
        );
    }
}

/// jsonc adds NO rules of its own: the rule set is exactly the jsonic one
/// (`val`, `map`, `list`, `pair`, `elem`), and the plugin stack the engine
/// records is jsonic then Jsonc, which is what the TypeScript
/// `debug-model` composition test asserts (minus its `Debug` member).
#[test]
fn the_plugin_adds_no_rules_and_sits_on_jsonic() {
    let parser = make();
    let mut rules = parser.rule_names();
    rules.sort();
    let mut jsonic_rules = tabnas_jsonic::make().rule_names();
    jsonic_rules.sort();
    assert_eq!(rules, jsonic_rules);
    assert_eq!(rules, ["elem", "list", "map", "pair", "val"]);

    let error = parser
        .parse("]")
        .expect_err("a stray close bracket is rejected");
    assert_eq!(error.plugins, ["jsonic", "Jsonc"]);
}

/// The embedded grammar text is the file at the repository root, byte for
/// byte, plus the leading newline the embedding adds. `ts/embed-grammar.js`
/// writes both; a hand edit between the markers fails here.
#[test]
fn embedded_grammar_matches_the_file_on_disk() {
    let on_disk = std::fs::read_to_string(repo_root().join("jsonc-grammar.jsonic"))
        .expect("jsonc-grammar.jsonic is readable");
    assert_eq!(
        grammar_text(),
        format!("\n{on_disk}"),
        "rs/src/lib.rs's embedded grammar differs from jsonc-grammar.jsonic; run `node ts/embed-grammar.js`"
    );
}

/// The Go embed holds the same text, so the three runtimes carry one
/// grammar. Read from go/jsonc.go rather than asserted through Go, since
/// this is the one place the Rust suite can see it.
#[test]
fn embedded_grammar_matches_the_go_embed() {
    let go = std::fs::read_to_string(repo_root().join("go").join("jsonc.go"))
        .expect("go/jsonc.go is readable");
    let begin = "const grammarText = `";
    let start = go.find(begin).expect("the Go embed begins") + begin.len();
    let end = go[start..].find('`').expect("the Go embed ends") + start;
    assert_eq!(&go[start..end], grammar_text());
}

/// The grammar's `number.exclude` is spelled as the shared `@/pattern/`
/// reference; the Rust engine takes the bare pattern, so the plugin
/// unwraps it. If it did not, the pattern would never match and `.0`
/// would be accepted.
#[test]
fn number_exclude_is_installed_as_a_bare_pattern() {
    let parser = make();
    assert_eq!(parser.config().number.exclude.as_deref(), Some(r"^\."));
    assert_eq!(code(".0"), "unexpected");
    assert_eq!(code(".5e1"), "unexpected");
    // The exclusion is exactly a leading dot: jsonic's other number
    // relaxations stay, as test/known-lenient.json records.
    assert_eq!(ok("-.123"), json!(-0.123));
    assert_eq!(ok("01"), json!(1));
    assert_eq!(ok("2.e3"), json!(2000));
}

/// The typed options round-trip through the engine's plugin option bag
/// with the TypeScript key names, and read a bag the way the Go `toBool`
/// does: only an exact `true` switches an option on.
#[test]
fn options_round_trip_through_the_plugin_bag() {
    let all = JsoncOptions::new()
        .with_allow_trailing_comma(true)
        .with_disallow_comments(true);
    assert_eq!(
        all.to_value().to_json(),
        json!({"allowTrailingComma": true, "disallowComments": true})
    );
    assert_eq!(JsoncOptions::from_value(&all.to_value()), all);
    assert_eq!(
        JsoncOptions::from_value(&JsoncOptions::default().to_value()),
        JsoncOptions::default()
    );

    assert_eq!(
        JsoncOptions::from_value(&Value::Undefined),
        JsoncOptions::default()
    );
    let odd = Value::from_json(&json!({"allowTrailingComma": "yes", "disallowComments": 1}));
    assert_eq!(JsoncOptions::from_value(&odd), JsoncOptions::default());

    // The bag reaches the plugin through use_plugin, keyed by the
    // TypeScript names.
    let mut parser = tabnas_jsonic::make();
    parser
        .use_plugin(
            plugin(),
            Some(Value::from_json(&json!({"disallowComments": true}))),
        )
        .expect("installs");
    rejects(&parser, "[1] // no");
    let bag = parser.plugin_options("jsonc").expect("the bag is recorded");
    assert_eq!(
        bag.to_json(),
        json!({"allowTrailingComma": false, "disallowComments": true})
    );
}

/// Installing on a bare engine, with no jsonic rules to extend, is an
/// error that names the repair rather than a grammar with alternates on
/// rules that do not exist.
#[test]
fn jsonc_without_jsonic_is_an_error() {
    let mut bare = Tabnas::new();
    let error = jsonc(&mut bare, &JsoncOptions::new()).expect_err("no base grammar");
    assert!(
        error.0.contains("tabnas_jsonic::jsonic"),
        "the error names the repair: {}",
        error.0
    );
}

/// The plugin re-applies to a derived instance, as a plugin installed
/// through `use_plugin` should, keeping its options.
#[test]
fn the_plugin_survives_derive() {
    let parser = make_with(JsoncOptions::new().with_allow_trailing_comma(true));
    let derived = parser.derive(|_| {}).expect("derives");
    accepts(&derived, "[1, /* c */ 2, ]", json!([1, 2]));
    assert_eq!(
        derived.parse("]").expect_err("rejected").plugins,
        ["jsonic", "Jsonc"]
    );
}

/// The layering the README shows: jsonic by hand, then jsonc by hand.
#[test]
fn layering_by_hand_matches_make() {
    let mut parser = Tabnas::new();
    tabnas_jsonic::jsonic(&mut parser).expect("jsonic installs");
    jsonc(&mut parser, &JsoncOptions::new()).expect("jsonc installs");
    for src in [r#"{ "foo": /*hello*/true }"#, "[1, 2]", "// only", "\"a\""] {
        assert_eq!(
            parser.parse(src).map(|v| flatten(&v)).map_err(|e| e.code),
            shared().parse(src).map(|v| flatten(&v)).map_err(|e| e.code),
            "{src:?}"
        );
    }
    for src in ["[1, 2, ]", "a:1", "{a:1}", "#", "'x'", "0x10"] {
        assert_eq!(
            parser.parse(src).map(|v| flatten(&v)).map_err(|e| e.code),
            shared().parse(src).map(|v| flatten(&v)).map_err(|e| e.code),
            "{src:?}"
        );
        rejects(&parser, src);
    }
}

/// The nesting limit, measured at its boundary rather than asserted from
/// the constant: `DEPTH_LIMIT` levels parse, one more is cancelled, for
/// both container shapes and for an unclosed document. The canonical
/// TypeScript plugin sets no limit; the departure is recorded in
/// ../../DIVERGENCE.md. The corpus test keeps the other side of the
/// boundary honest, since `test/known-lenient.json` pins the 500-level
/// `i_structure_500_nested_arrays` as accepted.
#[test]
fn nesting_deeper_than_the_limit_is_cancelled() {
    use tabnas_jsonc::DEPTH_LIMIT;

    let arrays = |depth: usize| format!("{}{}", "[".repeat(depth), "]".repeat(depth));
    let objects = |depth: usize| format!("{}1{}", r#"{"a":"#.repeat(depth), "}".repeat(depth));

    let value = shared()
        .parse(&arrays(DEPTH_LIMIT))
        .expect("the limit itself parses");
    assert_eq!(value.to_string(), arrays(DEPTH_LIMIT));
    shared()
        .parse(&objects(DEPTH_LIMIT))
        .expect("the limit itself parses, for objects");

    assert_eq!(code(&arrays(DEPTH_LIMIT + 1)), "cancel");
    assert_eq!(code(&objects(DEPTH_LIMIT + 1)), "cancel");

    // An unclosed document is stopped at the limit too, which is what
    // keeps the RFC corpus's 100,000-bracket case from running for hours.
    assert_eq!(code(&"[".repeat(DEPTH_LIMIT + 1)), "cancel");

    // The by-hand path carries the limit as well as `make` (the
    // `use_plugin` path, which `shared()` and `make_with` both take).
    // Each 1,000-level parse costs seconds in a debug build, so this is
    // the one extra construction checked at the boundary.
    let mut by_hand = Tabnas::new();
    tabnas_jsonic::jsonic(&mut by_hand).expect("jsonic installs");
    jsonc(&mut by_hand, &JsoncOptions::new()).expect("jsonc installs");
    assert_eq!(
        by_hand.parse(&arrays(DEPTH_LIMIT + 1)).unwrap_err().code,
        "cancel"
    );
}

/// `parse` shares one built instance across threads: `Tabnas` is
/// `Send + Sync` and `parse` takes `&self`, so concurrent callers do not
/// rebuild the grammar and do not disturb one another.
#[test]
fn parse_is_safe_across_threads() {
    let threads: Vec<_> = (0..8)
        .map(|n| {
            std::thread::spawn(move || {
                let src = format!("{{ \"n\": {n}, /* c */ \"xs\": [1, 2, 3] }}");
                for _ in 0..50 {
                    let value = parse(&src).expect("parses");
                    assert_eq!(flatten(&value), json!({"n": n, "xs": [1, 2, 3]}));
                    assert_eq!(parse("[1,]").unwrap_err().code, "unexpected");
                }
            })
        })
        .collect();
    for thread in threads {
        thread.join().expect("no thread panicked");
    }
}
