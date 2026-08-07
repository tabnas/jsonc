# Third-Party Notices

This project incorporates material from the projects listed below. The
original copyright notices and license texts are preserved as required.

**Neither corpus below is redistributed by this repository.** Both are
FETCHED at a pinned commit SHA by `scripts/fetch-conformance-suites.sh` into
`test/vendor/`, which `.gitignore` excludes. Their own `LICENSE` files come
down with the fetch and stay in place. (Before 2026-08 the JSONTestSuite
corpus was vendored here; it is not any more.)

## nst/JSONTestSuite

The RFC 8259 parsing corpus, used by `ts/test/jsontestsuite.test.ts` and
`go/jsontestsuite_test.go`, and as an input source for the derived JSONC
corpus.

- Project: https://github.com/nst/JSONTestSuite
- Pinned commit: `1ef36fa01286573e846ac449e8683f8833c5b26a`
- License: MIT
- Copyright (c) 2016 Nicolas Seriot

## microsoft/node-jsonc-parser

The de-facto normative JSONC implementation (the parser VS Code uses). Its
`src/test/json.test.ts` supplies hand-written conformance assertions, and the
implementation itself — compiled from the pinned source at fetch time — acts
as the reference oracle for the derived corpus. Parse-level test cases in
`ts/test/jsonc.test.ts` and `go/jsonc_test.go` were also ported from it.

- Project: https://github.com/microsoft/node-jsonc-parser
- Pinned commit: `3c9b4203d663061d87d4d34dd0004690aef94db5` (tag `v3.3.1`)
- License: MIT
- Copyright (c) Microsoft Corporation

---

Both projects are distributed under the MIT License. Full license text:

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
```
