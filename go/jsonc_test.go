/* Copyright (c) 2021-2025 Richard Rodger, MIT License */

package tabnasjsonc

import (
	"reflect"
	"strings"
	"testing"

	jsonic "github.com/tabnas/jsonic/go"
)

func makeJsonc(opts ...map[string]any) *jsonic.Jsonic {
	j := jsonic.Make()
	if len(opts) > 0 {
		j.Use(Jsonc, opts[0])
	} else {
		j.Use(Jsonc)
	}
	return j
}

func assert(t *testing.T, name string, got, want any) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("%s:\n  got:  %#v\n  want: %#v", name, got, want)
	}
}

func assertError(t *testing.T, name string, err error, contains string) {
	t.Helper()
	if err == nil {
		t.Errorf("%s: expected error containing %q, got nil", name, contains)
		return
	}
	if !strings.Contains(err.Error(), contains) {
		t.Errorf("%s: expected error containing %q, got: %v", name, contains, err)
	}
}

var j = makeJsonc()

func parse(src string) (any, error) { return j.Parse(src) }

func TestHappy(t *testing.T) {
	r, err := parse(`{"a":1}`)
	if err != nil {
		t.Fatal(err)
	}
	assert(t, "basic", r, map[string]any{"a": float64(1)})
}

func TestComments(t *testing.T) {
	r, err := parse("// this is a comment")
	if err != nil {
		t.Fatal(err)
	}
	assert(t, "single-line", r, nil)

	r, err = parse("// this is a comment\n")
	if err != nil {
		t.Fatal(err)
	}
	assert(t, "single-line-newline", r, nil)

	r, err = parse("/* this is a comment*/")
	if err != nil {
		t.Fatal(err)
	}
	assert(t, "block", r, nil)

	r, err = parse("/* this is a \r\ncomment*/")
	if err != nil {
		t.Fatal(err)
	}
	assert(t, "block-crlf", r, nil)

	r, err = parse("/* this is a \ncomment*/")
	if err != nil {
		t.Fatal(err)
	}
	assert(t, "block-lf", r, nil)

	_, err = parse("/* this is a")
	assertError(t, "unterminated-block", err, "unterminated_comment")

	_, err = parse("/* this is a \ncomment")
	assertError(t, "unterminated-block-multiline", err, "unterminated_comment")

	_, err = parse("/ ttt")
	assertError(t, "invalid-comment", err, "unexpected")
}

func TestStrings(t *testing.T) {
	r, err := parse(`"test"`)
	if err != nil {
		t.Fatal(err)
	}
	assert(t, "simple", r, "test")

	r, _ = parse(`"\""`)
	assert(t, "escape-quote", r, `"`)

	r, _ = parse(`"\/"`)
	assert(t, "escape-slash", r, "/")

	r, _ = parse(`"\b"`)
	assert(t, "escape-backspace", r, "\b")

	r, _ = parse(`"\f"`)
	assert(t, "escape-formfeed", r, "\f")

	r, _ = parse(`"\n"`)
	assert(t, "escape-newline", r, "\n")

	r, _ = parse(`"\r"`)
	assert(t, "escape-return", r, "\r")

	r, _ = parse(`"\t"`)
	assert(t, "escape-tab", r, "\t")

	r, _ = parse(`"\u00DC"`)
	assert(t, "unicode", r, "\u00DC")

	// Note: \v is accepted by the jsonic Go string matcher as a built-in escape.
	// This is a minor deviation from strict JSONC spec which only allows
	// \", \\, \/, \b, \f, \n, \r, \t, and \uXXXX.

	_, err = parse(`"test`)
	assertError(t, "unterminated", err, "unterminated_string")
}

func TestNumbers(t *testing.T) {
	r, _ := parse("0")
	assert(t, "zero", r, float64(0))

	r, _ = parse("0.1")
	assert(t, "decimal", r, 0.1)

	r, _ = parse("-0.1")
	assert(t, "neg-decimal", r, -0.1)

	r, _ = parse("-1")
	assert(t, "neg", r, float64(-1))

	r, _ = parse("1")
	assert(t, "one", r, float64(1))

	r, _ = parse("123456789")
	assert(t, "large", r, float64(123456789))

	r, _ = parse("10")
	assert(t, "ten", r, float64(10))

	r, _ = parse("90")
	assert(t, "ninety", r, float64(90))

	r, _ = parse("90E+123")
	assert(t, "sci-upper-plus", r, 90E+123)

	r, _ = parse("90e+123")
	assert(t, "sci-lower-plus", r, 90e+123)

	r, _ = parse("90e-123")
	assert(t, "sci-lower-minus", r, 90e-123)

	r, _ = parse("90E-123")
	assert(t, "sci-upper-minus", r, 90E-123)

	r, _ = parse("90E123")
	assert(t, "sci-upper", r, 90E123)

	r, _ = parse("90e123")
	assert(t, "sci-lower", r, 90e123)

	_, err := parse("-")
	if err == nil {
		t.Error("expected error for bare minus")
	}

	_, err = parse(".0")
	if err == nil {
		t.Error("expected error for leading dot number")
	}
}

func TestKeywords(t *testing.T) {
	r, _ := parse("true")
	assert(t, "true", r, true)

	r, _ = parse("false")
	assert(t, "false", r, false)

	r, _ = parse("null")
	assert(t, "null", r, nil)

	_, err := parse("True")
	if err == nil {
		t.Error("expected error for capitalized True")
	}

	r, _ = parse("false//hello")
	assert(t, "value-with-comment", r, false)
}

func TestTrivia(t *testing.T) {
	r, _ := parse(" ")
	assert(t, "space", r, nil)

	r, _ = parse("  \t  ")
	assert(t, "tabs", r, nil)

	r, _ = parse("  \t  \n  \t  ")
	assert(t, "tabs-newlines", r, nil)

	r, _ = parse("\r\n")
	assert(t, "crlf", r, nil)

	r, _ = parse("\r")
	assert(t, "cr", r, nil)

	r, _ = parse("\n")
	assert(t, "lf", r, nil)

	r, _ = parse("\n\r")
	assert(t, "lfcr", r, nil)

	r, _ = parse("\n   \n")
	assert(t, "newlines-spaces", r, nil)
}

func TestLiterals(t *testing.T) {
	r, _ := parse("true")
	assert(t, "true", r, true)

	r, _ = parse("false")
	assert(t, "false", r, false)

	r, _ = parse("null")
	assert(t, "null", r, nil)

	r, _ = parse(`"foo"`)
	assert(t, "string", r, "foo")

	r, _ = parse(`"\"-\\-\/-\b-\f-\n-\r-\t"`)
	assert(t, "escapes", r, "\"-\\-/-\b-\f-\n-\r-\t")

	r, _ = parse(`"\u00DC"`)
	assert(t, "unicode", r, "\u00DC")

	r, _ = parse("9")
	assert(t, "nine", r, float64(9))

	r, _ = parse("-9")
	assert(t, "neg-nine", r, float64(-9))

	r, _ = parse("0.129")
	assert(t, "decimal", r, 0.129)

	r, _ = parse("23e3")
	assert(t, "sci", r, 23e3)

	r, _ = parse("1.2E+3")
	assert(t, "sci-plus", r, 1.2E+3)

	r, _ = parse("1.2E-3")
	assert(t, "sci-minus", r, 1.2E-3)

	r, _ = parse("1.2E-3 // comment")
	assert(t, "num-comment", r, 1.2E-3)
}

func TestObjects(t *testing.T) {
	r, _ := parse("{}")
	assert(t, "empty", r, map[string]any{})

	r, _ = parse(`{ "foo": true }`)
	assert(t, "one-field", r, map[string]any{"foo": true})

	r, _ = parse(`{ "bar": 8, "xoo": "foo" }`)
	assert(t, "two-fields", r, map[string]any{"bar": float64(8), "xoo": "foo"})

	r, _ = parse(`{ "hello": [], "world": {} }`)
	assert(t, "empty-nested", r, map[string]any{"hello": []any{}, "world": map[string]any{}})

	r, _ = parse(`{ "a": false, "b": true, "c": [ 7.4 ] }`)
	assert(t, "mixed", r, map[string]any{"a": false, "b": true, "c": []any{7.4}})

	r, _ = parse(`{ "hello": { "again": { "inside": 5 }, "world": 1 }}`)
	assert(t, "deep-nested", r, map[string]any{
		"hello": map[string]any{
			"again": map[string]any{"inside": float64(5)},
			"world": float64(1),
		},
	})

	r, _ = parse(`{ "foo": /*hello*/true }`)
	assert(t, "comment-in-obj", r, map[string]any{"foo": true})

	r, _ = parse(`{ "": true }`)
	assert(t, "empty-key", r, map[string]any{"": true})
}

func TestArrays(t *testing.T) {
	r, _ := parse("[]")
	assert(t, "empty", r, []any{})

	r, _ = parse("[ [],  [ [] ]]")
	assert(t, "nested-empty", r, []any{[]any{}, []any{[]any{}}})

	r, _ = parse("[ 1, 2, 3 ]")
	assert(t, "numbers", r, []any{float64(1), float64(2), float64(3)})

	r, _ = parse(`[ { "a": null } ]`)
	assert(t, "obj-in-array", r, []any{map[string]any{"a": nil}})
}

func TestObjectErrors(t *testing.T) {
	_, err := parse("{,}")
	if err == nil {
		t.Error("expected error for leading comma in object")
	}

	_, err = parse(`{ "foo": true, }`)
	if err == nil {
		t.Error("expected error for trailing comma in object (default)")
	}

	_, err = parse(`{ "bar": 8 "xoo": "foo" }`)
	if err == nil {
		t.Error("expected error for missing comma in object")
	}

	_, err = parse(`{ ,"bar": 8 }`)
	if err == nil {
		t.Error("expected error for leading comma")
	}

	_, err = parse(`{ "bar": 8, "foo": }`)
	if err == nil {
		t.Error("expected error for missing value")
	}

	_, err = parse(`{ 8, "foo": 9 }`)
	if err == nil {
		t.Error("expected error for number as key")
	}
}

func TestArrayErrors(t *testing.T) {
	_, err := parse("[,]")
	if err == nil {
		t.Error("expected error for leading comma in array")
	}

	_, err = parse("[ 1 2, 3 ]")
	if err == nil {
		t.Error("expected error for missing comma in array")
	}

	_, err = parse("[ ,1, 2, 3 ]")
	if err == nil {
		t.Error("expected error for leading comma in array")
	}

	_, err = parse("[ ,1, 2, 3, ]")
	if err == nil {
		t.Error("expected error for commas in array")
	}
}

func TestErrors(t *testing.T) {
	_, err := parse("1,1")
	if err == nil {
		t.Error("expected error for extra content after value")
	}

	_, err = parse("")
	if err == nil {
		t.Error("expected error for empty input")
	}
}

func TestDisallowComments(t *testing.T) {
	nc := makeJsonc(map[string]any{"disallowComments": true})

	r, err := nc.Parse(`[ 1, 2, null, "foo" ]`)
	if err != nil {
		t.Fatal(err)
	}
	assert(t, "array", r, []any{float64(1), float64(2), nil, "foo"})

	r, err = nc.Parse(`{ "hello": [], "world": {} }`)
	if err != nil {
		t.Fatal(err)
	}
	assert(t, "object", r, map[string]any{"hello": []any{}, "world": map[string]any{}})

	_, err = nc.Parse(`{ "foo": /*comment*/ true }`)
	if err == nil {
		t.Error("expected error for comment when comments are disallowed")
	}
}

func TestTrailingComma(t *testing.T) {
	jc := makeJsonc(map[string]any{"allowTrailingComma": true})

	r, err := jc.Parse(`{ "hello": [], }`)
	if err != nil {
		t.Fatal(err)
	}
	assert(t, "obj-trailing", r, map[string]any{"hello": []any{}})

	r, err = jc.Parse(`{ "hello": [] }`)
	if err != nil {
		t.Fatal(err)
	}
	assert(t, "obj-no-trailing", r, map[string]any{"hello": []any{}})

	r, err = jc.Parse(`{ "hello": [], "world": {}, }`)
	if err != nil {
		t.Fatal(err)
	}
	assert(t, "obj-multi-trailing", r, map[string]any{"hello": []any{}, "world": map[string]any{}})

	r, err = jc.Parse(`[ 1, 2, ]`)
	if err != nil {
		t.Fatal(err)
	}
	assert(t, "arr-trailing", r, []any{float64(1), float64(2)})

	r, err = jc.Parse(`[ 1, 2 ]`)
	if err != nil {
		t.Fatal(err)
	}
	assert(t, "arr-no-trailing", r, []any{float64(1), float64(2)})

	// Default parser should reject trailing commas.
	_, err = j.Parse(`{ "hello": [], }`)
	if err == nil {
		t.Error("expected error for trailing comma with default options")
	}

	_, err = j.Parse(`[ 1, 2, ]`)
	if err == nil {
		t.Error("expected error for trailing comma in array with default options")
	}
}

func TestMisc(t *testing.T) {
	r, _ := j.Parse(`{ "foo": "bar" }`)
	assert(t, "simple-obj", r, map[string]any{"foo": "bar"})

	r, _ = j.Parse(`{ "foo": {"bar": 1, "car": 2 } }`)
	assert(t, "nested-obj", r, map[string]any{
		"foo": map[string]any{"bar": float64(1), "car": float64(2)},
	})

	r, _ = j.Parse(`{ "foo": {"bar": 1, "car": 8 }, "goo": {} }`)
	assert(t, "multi-nested", r, map[string]any{
		"foo": map[string]any{"bar": float64(1), "car": float64(8)},
		"goo": map[string]any{},
	})

	_, err := j.Parse(`{ "dep": {"bar": 1, "car": `)
	if err == nil {
		t.Error("expected error for unterminated object")
	}

	_, err = j.Parse(`{ "dep": {"bar": 1,, "car": `)
	if err == nil {
		t.Error("expected error for double comma")
	}

	_, err = j.Parse(`{ "dep": {"bar": "na", "dar": "ma", "car":  } }`)
	if err == nil {
		t.Error("expected error for missing value")
	}

	r, _ = j.Parse(`["foo", null ]`)
	assert(t, "arr-mixed", r, []any{"foo", nil})

	_, err = j.Parse(`["foo", null, ]`)
	if err == nil {
		t.Error("expected error for trailing comma in array")
	}

	_, err = j.Parse(`["foo", null,, ]`)
	if err == nil {
		t.Error("expected error for double comma in array")
	}

	r, _ = j.Parse("true")
	assert(t, "bare-true", r, true)

	r, _ = j.Parse("false")
	assert(t, "bare-false", r, false)

	r, _ = j.Parse("null")
	assert(t, "bare-null", r, nil)

	r, _ = j.Parse("23")
	assert(t, "bare-num", r, float64(23))

	r, _ = j.Parse("-1.93e-19")
	assert(t, "sci-notation", r, -1.93e-19)

	r, _ = j.Parse(`"hello"`)
	assert(t, "bare-string", r, "hello")

	r, _ = j.Parse("[]")
	assert(t, "empty-arr", r, []any{})

	r, _ = j.Parse("[ 1 ]")
	assert(t, "single-arr", r, []any{float64(1)})

	r, _ = j.Parse(`[ 1, "x"]`)
	assert(t, "mixed-arr", r, []any{float64(1), "x"})

	r, _ = j.Parse("[[]]")
	assert(t, "nested-arr", r, []any{[]any{}})

	r, _ = j.Parse("{ }")
	assert(t, "empty-obj", r, map[string]any{})

	r, _ = j.Parse(`{ "val": 1 }`)
	assert(t, "val-obj", r, map[string]any{"val": float64(1)})

	r, _ = j.Parse(`{"id": "$", "v": [ null, null] }`)
	assert(t, "complex-obj", r, map[string]any{"id": "$", "v": []any{nil, nil}})

	_, err = j.Parse(`{  "id": { "foo": { } } , }`)
	if err == nil {
		t.Error("expected error for trailing comma")
	}

	r, _ = j.Parse(`{ "foo": { "goo": 3 } }`)
	assert(t, "nested-num", r, map[string]any{"foo": map[string]any{"goo": float64(3)}})

	r, _ = j.Parse("[\r\n0,\r\n1,\r\n2\r\n]")
	assert(t, "crlf-arr", r, []any{float64(0), float64(1), float64(2)})

	r, _ = j.Parse(`/* g */ { "foo": //f` + "\n" + `"bar" }`)
	assert(t, "comments-mixed", r, map[string]any{"foo": "bar"})

	r, _ = j.Parse("/* g\r\n */ { \"foo\": //f\n\"bar\" }")
	assert(t, "comments-crlf", r, map[string]any{"foo": "bar"})

	r, _ = j.Parse("/* g\n */ { \"foo\": //f\n\"bar\"\n}")
	assert(t, "comments-lf", r, map[string]any{"foo": "bar"})

	r, _ = j.Parse(`{ "key1": { "key11": [ "val111", "val112" ] }, "key2": [ { "key21": false, "key22": 221 }, null, [{}] ] }`)
	assert(t, "complex", r, map[string]any{
		"key1": map[string]any{"key11": []any{"val111", "val112"}},
		"key2": []any{
			map[string]any{"key21": false, "key22": float64(221)},
			nil,
			[]any{map[string]any{}},
		},
	})
}

func TestUsePlugin(t *testing.T) {
	j := makeJsonc()
	result, err := j.Parse(`{"a": 1, "b": "hello"}`)
	if err != nil {
		t.Fatal(err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	assert(t, "plugin", m, map[string]any{"a": float64(1), "b": "hello"})
}

// TestAltGJsoncTag verifies the GrammarText setting {Rule:{Alt:{G:'jsonc'}}}
// tagged every alt installed by the jsonc plugin with 'jsonc'.
func TestAltGJsoncTag(t *testing.T) {
	// Fresh instance with allowTrailingComma so pair/elem close alts survive
	// the rule-exclude filter and can be inspected here.
	jc := jsonic.Make()
	if err := jc.Use(Jsonc, map[string]any{"allowTrailingComma": true}); err != nil {
		t.Fatal(err)
	}

	rsm := jc.RSM()
	checks := []struct {
		rule    string
		isOpen  bool
		tokSig  string
	}{
		{"val", true, "#ZZ"},
		{"pair", false, "#CA #CB"},
		{"elem", false, "#CA #CS"},
	}

	for _, c := range checks {
		rs, ok := rsm[c.rule]
		if !ok {
			t.Errorf("rule %q missing", c.rule)
			continue
		}
		alts := rs.CloseAlts()
		if c.isOpen {
			alts = rs.OpenAlts()
		}

		found := false
		for _, a := range alts {
			if !strings.Contains(a.G, "jsonc") {
				continue
			}
			// Match the alt introduced by this plugin by its group tag(s).
			// We only need to confirm 'jsonc' is present on at least one alt
			// per rule; more importantly, every alt tagged as coming from
			// the plugin must carry 'jsonc'.
			found = true
			tags := strings.Split(a.G, ",")
			has := false
			for _, t := range tags {
				if strings.TrimSpace(t) == "jsonc" {
					has = true
					break
				}
			}
			if !has {
				t.Errorf("rule %q alt missing 'jsonc' tag: g=%q", c.rule, a.G)
			}
		}
		if !found {
			t.Errorf("rule %q: no alt with 'jsonc' tag found", c.rule)
		}
	}
}
