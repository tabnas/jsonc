// Copyright (c) 2026 Richard Rodger and other contributors, MIT License

package tabnasjsonc

// window_test.go — a parse from a reader (Tabnas.ParseReader, admin ADR-30
// and ADR-33).
//
// Make builds the parser whole, as tabnasjsonic.Make() then
// j.Use(Jsonc, opts) builds it, and declares lex.window on it, so that a
// reader is read a window at a time. These tests hold it to that: Make
// declares the window and parses every fixture row as that composition
// does; every row, and every document of the JSONTestSuite corpus in each
// of the three modes, parses the same from a reader, in pieces of 1, 3, 64
// and 4096 bytes, as from its text, but for the corpus documents that are
// not UTF-8, which a reader refuses as unreadable; and a long document
// parses the same, its tokens of every kind long and short.
//
// Go's window sizes are fixed at 64 KiB (the engine's small-window hook is
// unexported), and before each token the window reaches 64 KiB past the
// cursor, so a token meets the window's edge only where it is longer than
// that: the long document carries such tokens of every kind.

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"unicode/utf8"

	jsonic "github.com/tabnas/jsonic/go"
	tabnas "github.com/tabnas/parser/go"
	support "github.com/tabnas/support/go"
)

// readerMargin is how far past the cursor the window reaches before each
// token is cut: a token longer than this meets the window's edge.
const readerMargin = 64 << 10

// pieces is a reader that hands its bytes over at most size at a time.
type pieces struct {
	text []byte
	at   int
	size int
}

func (p *pieces) Read(buf []byte) (int, error) {
	if p.at == len(p.text) {
		return 0, io.EOF
	}
	n := min(p.size, len(buf), len(p.text)-p.at)
	copy(buf, p.text[p.at:p.at+n])
	p.at += n
	return n, nil
}

// outcome is what a parse shows: its value, or its error's code, position,
// row, column and token text. An error's excerpt is left out: a parse from
// a reader shows a long line only as far back as the window reaches
// (tabnas/parser DIVERGENCE.md), and that is the one difference allowed.
type outcome struct {
	value any
	err   string
}

func outcomeOf(v any, err error) outcome {
	if err == nil {
		return outcome{value: v}
	}
	var te *tabnas.TabnasError
	if errors.As(err, &te) {
		return outcome{err: fmt.Sprintf("%s at %d %d:%d %q", te.Code, te.Pos, te.Row, te.Col, te.Src)}
	}
	return outcome{err: "not a TabnasError: " + err.Error()}
}

func (o outcome) String() string {
	if o.err != "" {
		return "error " + o.err
	}
	s := fmt.Sprintf("value %v", o.value)
	if len(s) > 200 {
		s = s[:200] + "..."
	}
	return s
}

func (o outcome) same(p outcome) bool {
	return o.err == p.err && reflect.DeepEqual(o.value, p.value)
}

// sameFromReader parses text whole and from a reader in pieces of each
// size, and reports where the two differ. It returns the number of reader
// parses compared.
func sameFromReader(t *testing.T, j *tabnas.Tabnas, at, text string, sizes []int) int {
	t.Helper()
	whole := outcomeOf(j.Parse(text))
	for _, size := range sizes {
		read := outcomeOf(j.ParseReader(&pieces{text: []byte(text), size: size}))
		if !read.same(whole) {
			t.Errorf("%s in pieces of %d:\n  whole:  %s\n  reader: %s", at, size, whole, read)
		}
	}
	return len(sizes)
}

// readerSizes are the pieces a document is handed over in: down to a byte
// for a short one, and from 64 bytes for one over 8 KiB, whose every
// one-byte read the Go window answers with a copy of itself
// (tabnas/parser#321).
func readerSizes(text string) []int {
	if len(text) > 8<<10 {
		return []int{64, 4096, readerMargin + 3}
	}
	return []int{1, 3, 64, 4096}
}

// fixtureRows calls each with every row of the shared fixtures: where it
// is, its input and its plugin options.
func fixtureRows(t *testing.T, each func(at, input string, opts map[string]any)) {
	t.Helper()
	dir, err := support.FindSpecDir("")
	if err != nil {
		t.Fatal(err)
	}
	paths, err := filepath.Glob(filepath.Join(dir, "*.tsv"))
	if err != nil || len(paths) == 0 {
		t.Fatalf("no fixtures in %s: %v", dir, err)
	}
	for _, path := range paths {
		spec, err := support.LoadSpec(path, nil)
		if err != nil {
			t.Fatal(err)
		}
		for _, row := range spec.Rows {
			opts := map[string]any{}
			if raw := row.Named("opts"); raw != "" {
				if err := json.Unmarshal([]byte(raw), &opts); err != nil {
					t.Fatalf("%s:%d: opts: %v", filepath.Base(path), row.Line, err)
				}
			}
			each(fmt.Sprintf("%s:%d", filepath.Base(path), row.Line), specUnescape(row.Named("input")), opts)
		}
	}
}

// TestMakeDeclaresTheWindow: Make declares lex.window; the plugin alone,
// which a host may install beneath matchers of its own, declares nothing.
func TestMakeDeclaresTheWindow(t *testing.T) {
	if !Make().Config().Window {
		t.Error("Make does not declare lex.window")
	}
	j := jsonic.Make()
	if err := j.Use(Jsonc, nil); err != nil {
		t.Fatal(err)
	}
	if j.Config().Window {
		t.Error("the Jsonc plugin declares lex.window")
	}
}

// TestMakeParsesAsTheComposition: every fixture row parses through Make as
// through jsonic.Make() then j.Use(Jsonc, opts), which dmog composed.
func TestMakeParsesAsTheComposition(t *testing.T) {
	n := 0
	fixtureRows(t, func(at, input string, opts map[string]any) {
		j := jsonic.Make()
		if err := j.Use(Jsonc, opts); err != nil {
			t.Fatal(err)
		}
		composed := outcomeOf(j.Parse(input))
		made := outcomeOf(Make(opts).Parse(input))
		if !made.same(composed) {
			t.Errorf("%s:\n  Make:     %s\n  composed: %s", at, made, composed)
		}
		n++
	})
	if n < 100 {
		t.Errorf("only %d rows", n)
	}
}

// TestFixturesFromAReader: every fixture row parses the same from a reader
// as from its text, under Make with the row's options.
func TestFixturesFromAReader(t *testing.T) {
	compared := 0
	fixtureRows(t, func(at, input string, opts map[string]any) {
		compared += sameFromReader(t, Make(opts), at, input, readerSizes(input))
	})
	t.Logf("reader fixtures: %d reader parses (100%%)", compared)
	if compared < 400 {
		t.Errorf("only %d reader parses", compared)
	}
}

// TestCorpusFromAReader: every JSONTestSuite document that is UTF-8 parses
// the same from a reader as from its text, in each of the three modes; one
// that is not, a reader refuses as unreadable.
func TestCorpusFromAReader(t *testing.T) {
	files := jtsFiles(t)
	modes := []struct {
		name string
		opts map[string]any
	}{
		{"strict (disallowComments)", map[string]any{"disallowComments": true}},
		{"comments", map[string]any{}},
		{"allowTrailingComma", map[string]any{"allowTrailingComma": true}},
	}
	compared, refused := 0, 0
	for n, mode := range modes {
		j := Make(mode.opts)
		for _, file := range files {
			b, err := os.ReadFile(filepath.Join(jtsDir(), file))
			if err != nil {
				t.Fatal(err)
			}
			if !utf8.Valid(b) {
				refused++
				read := outcomeOf(j.ParseReader(&pieces{text: b, size: 3}))
				if !strings.HasPrefix(read.err, "unreadable ") {
					t.Errorf("%s %s: from a reader %s, not unreadable", mode.name, file, read)
				}
				continue
			}
			text := string(b)
			compared += sameFromReader(t, j, mode.name+" "+file, text, readerSizes(text))
		}
		t.Logf("reader corpus: %d of %d modes (%d%%), %d reader parses",
			n+1, len(modes), (n+1)*100/len(modes), compared)
	}
	if refused != 3*25 {
		t.Errorf("%d documents refused as not UTF-8, want %d", refused, 3*25)
	}
	if compared < 3000 {
		t.Errorf("only %d reader parses", compared)
	}
}

// TestLongDocumentFromAReader: a document of over a megabyte, its tokens of
// every kind long and short, the long ones longer than the window, parses
// the same from a reader as from its text in each mode, and so does the
// same document with an error at its end, which a parse from a reader
// places where the whole text does after the window has moved on many
// times.
func TestLongDocumentFromAReader(t *testing.T) {
	long := readerMargin + 2<<10
	var b strings.Builder
	b.WriteString("// records\n[\n")
	for i := 0; i < 3000; i++ {
		fmt.Fprintf(&b, "  {\"id\": %d, \"name\": \"ñ%d\\u00e9\" /* note %d */, \"tags\": [\"a\", \"b\"], \"n\": -1.5e3}, // row %d\n", i, i, i, i)
		if i == 1000 || i == 2000 {
			fmt.Fprintf(&b, "  \"%s\",\n", strings.Repeat("s\\n", long/3))
			fmt.Fprintf(&b, "  1%s,\n", strings.Repeat("0", long))
			fmt.Fprintf(&b, "  -1.%se3,\n", strings.Repeat("5", long))
			fmt.Fprintf(&b, "  // %s\n", strings.Repeat("c", long))
			fmt.Fprintf(&b, "  /* %s */\n", strings.Repeat("b\n", long/2))
			fmt.Fprintf(&b, "%s\n%s", strings.Repeat(" ", long), strings.Repeat("\n", long))
		}
	}
	text := b.String() + "  0\n]\n"
	broken := b.String() + "  \"tail\x01\"\n]\n"
	if len(text) < 1<<20 {
		t.Fatalf("the document is %d bytes", len(text))
	}
	for n, opts := range []map[string]any{{}, {"allowTrailingComma": true}} {
		j := Make(opts)
		if _, err := j.Parse(text); err != nil {
			t.Fatalf("the long document does not parse: %v", err)
		}
		if _, err := j.Parse(broken); err == nil || err.(*tabnas.TabnasError).Code != "unprintable" {
			t.Fatalf("the broken document is not unprintable: %v", err)
		}
		sameFromReader(t, j, "the long document", text, []int{64, 4096, readerMargin + 3})
		sameFromReader(t, j, "the long document with an error at its end", broken, []int{4096, readerMargin + 3})
		t.Logf("reader long document: %d of 2 modes (%d%%), %d bytes", n+1, (n+1)*50, len(text))
	}
}
