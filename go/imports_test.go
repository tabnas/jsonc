/* Copyright (c) 2021-2025 Richard Rodger, MIT License */

package tabnasjsonc

import (
	"go/parser"
	"go/token"
	"strconv"
	"testing"
)

// TestJsoncImportsJsonic holds jsonc.go to its import of jsonic. Jsonc reads
// its grammar with j.GrammarText, and only jsonic registers the text parser
// that needs (in its init). This package's other tests import jsonic
// themselves, so they would pass without it, while a program that imports
// only this package and the engine would fail with "no text parser
// registered".
func TestJsoncImportsJsonic(t *testing.T) {
	f, err := parser.ParseFile(token.NewFileSet(), "jsonc.go", nil, parser.ImportsOnly)
	if err != nil {
		t.Fatal(err)
	}
	for _, imp := range f.Imports {
		if path, _ := strconv.Unquote(imp.Path.Value); path == "github.com/tabnas/jsonic/go" {
			return
		}
	}
	t.Fatal("jsonc.go does not import github.com/tabnas/jsonic/go: Jsonc's GrammarText needs the text parser jsonic registers")
}
