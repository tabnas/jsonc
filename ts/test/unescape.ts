/* Copyright (c) 2025 Richard Rodger and other contributors, MIT License */

// The one thing this repo does not take from @tabnas/support: its own
// escape codec, because jsonc's fixtures need a sixth escape.
//
// A raw NUL inside a string must be rejected as `unprintable`, and a NUL
// cannot be written literally in a .tsv — git would call the file binary.
// The shared codec passes `\0` through unchanged on purpose (a fixture has
// to be able to carry a literal backslash-zero; json5's `\\0` rows rely on
// exactly that), so decoding it has to happen HERE, in one pass over the
// RAW cell. Two passes cannot work: after the shared codec, `\0` from `\0`
// and `\0` from `\\0` are the same two characters.
//
// Kept byte-identical to `specUnescape` in go/parity_test.go.
export function unescapeJsonc(s: string): string {
  if (!s.includes('\\')) return s
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '\\' && i + 1 < s.length) {
      const n = s[i + 1]
      if (n === 'n') { out += '\n'; i++; continue }
      if (n === 'r') { out += '\r'; i++; continue }
      if (n === 't') { out += '\t'; i++; continue }
      if (n === '0') { out += '\0'; i++; continue }
      if (n === '\\') { out += '\\'; i++; continue }
    }
    out += c
  }
  return out
}
