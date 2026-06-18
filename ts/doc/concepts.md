# Concepts

Background on how the `@tabnas/jsonc` plugin works, and why it is shaped
the way it is. This is understanding-oriented reading — for steps see the
[tutorial](tutorial.md) and [how-to guide](guide.md), and for exact
signatures see the [reference](reference.md).

## JSONC is a plugin, not a parser

`@tabnas/jsonc` does not parse anything by itself. It is a **plugin** that
configures an existing parser:

- the [`@tabnas/parser`](https://github.com/tabnas/parser) **engine** — a
  rule-based parser over a configurable, matcher-based lexer; and
- the [`@tabnas/jsonic`](https://github.com/tabnas/jsonic) **base
  grammar** — the relaxed-JSON rules (`val`, `map`, `list`, `pair`,
  `elem`) that turn text into objects, arrays, and scalars.

`Jsonc` runs last in the `.use(jsonic).use(Jsonc)` chain. It does **not**
add rules of its own. Instead it tightens jsonic's lenient defaults
toward standard JSON, switches comment lexing on or off, and installs a
small number of extra **alternates** on rules jsonic already provides.
That is the whole plugin — a configuration delta on a general engine.

## What the plugin installs

The grammar delta is authored once, in the repository-root
`jsonc-grammar.jsonic`, and embedded verbatim into both the TypeScript
(`src/jsonc.ts`) and Go (`go/jsonc.go`) sources by `embed-grammar.js`. It
does two kinds of thing.

**Tighten lexer/value options toward JSON.** jsonic is happy with bare
unquoted text, hex/octal/binary numbers, alternate quote characters, and
more. The grammar turns these off: `text.lex = false`, `number.hex/oct/
bin = false`, `string.chars = '"'` (double quotes only), the non-JSON `\v`
escape disabled, and map-key extension disabled. The result reads like
JSON rather than the looser jsonic dialect.

**Add three alternates.** On top of jsonic's rules it installs:

- an end-of-input alternate (`#ZZ`) on the `val` rule, so a document that
  is only comments or whitespace resolves to a value (`undefined`)
  instead of erroring on "no value";
- a trailing-comma alternate on `pair` close (`#CA #CB` — comma then
  close-brace); and
- a trailing-comma alternate on `elem` close (`#CA #CS` — comma then
  close-square).

Each installed alternate is tagged with the group `jsonc` (via the
`grammar(..., { rule: { alt: { g: 'jsonc' } } })` setting), which lets the
plugin's runtime options selectively include or exclude them.

## How the two options take effect

The two `JsoncOptions` flags do not rewrite the grammar — they flip
runtime switches the grammar already exposes.

`disallowComments` controls **lexing**. The plugin sets
`comment.lex = !disallowComments`. When comments are disallowed, the
comment matcher is simply not built, so `//` and `/* */` produce
`unexpected` tokens like any other stray characters.

`allowTrailingComma` controls **rule inclusion**. The plugin always
includes the `jsonc` and `json` rule groups, and it **excludes the
`comma` group** unless the option is set. The trailing-comma alternates on
`pair` and `elem` carry the `comma` tag, so excluding that group removes
exactly those alternates — without touching the rest of the grammar. Set
the option, and the same alternates are included again.

This is why a single grammar text serves all four configurations: the
alternates are always present in the spec, and inclusion filtering decides
which ones are active for a given instance.

## Two stages: lexer, then parser

A parse runs in two cooperating stages, both inherited from the engine.

The **lexer** turns source text into tokens using independent
**matchers** (fixed punctuation, space, line endings, strings, comments,
numbers, …). The JSONC configuration narrows which matchers run and how:
double-quote strings only, JSON-shaped numbers, comments on or off. The
ignorable tokens — comments (`CM`), newlines (`LN`), and whitespace
(`SP`) — are consumed and dropped, which is why a comment can sit between
a key and its value.

The **parser** consumes tokens according to the five rules. Each rule has
an **open** and **close** phase holding alternates with at most two tokens
of lookahead. The trailing-comma alternates are close-phase alternates
that match "comma immediately followed by the closing bracket" — exactly
the trailing-comma shape — and the end-of-input alternate closes off the
top-level `val`. There is no backtracking search, which keeps parsing
linear.

## Accepted vs. rejected edge cases

The grammar pushes jsonic toward JSON, but jsonic stays intentionally
lenient in a few places. The repository runs the
[nst/JSONTestSuite](https://github.com/nst/JSONTestSuite) corpus in strict
mode and pins the divergences in `ts/test/jsontestsuite.test.ts`
(`N_KNOWN_LENIENT`).

**Accepted, though strict RFC 8259 rejects:**

- numbers with a leading zero — `01` parses to `1`, `-01` to `-1`;
- a handful of malformed-number and unquoted-key shapes that the corpus
  flags (e.g. `2.e3`, `0.e1`, a non-string key in specific positions).

**Rejected, as JSON requires:**

- unterminated strings (`unterminated_string`) and comments
  (`unterminated_comment`);
- raw control characters inside a string, such as a literal tab or
  newline (`unprintable`);
- the non-JSON `\v` string escape (`unexpected`);
- capitalized or partial keywords (`True`, `nulllll`) and bare `-`
  (`unexpected`);
- leading and doubled commas, e.g. `[ ,1 ]` and `[ 1,, 2 ]`;
- trailing commas, unless `allowTrailingComma` is set;
- comments, when `disallowComments` is set.

If you need byte-perfect RFC 8259 conformance, use an RFC-strict parser.
JSONC here is "JSON, comfortably" — close to the spec, lenient where
jsonic historically is.

## Why this design

Keeping JSONC as a thin plugin has three payoffs. The grammar is **just
data** fed to a general engine, so the same machinery drives strict JSON,
plain jsonic, and any plugin you write. The TypeScript and Go ports stay
in lockstep because they **embed the identical grammar text**. And
behavior is **option-conditional without code branches**: comment lexing
and trailing-comma support are flipped by lexer config and rule-group
inclusion, not by maintaining separate grammars.

For how the Go port differs from this canonical behavior, see
[../../go/doc/concepts.md](../../go/doc/concepts.md).
