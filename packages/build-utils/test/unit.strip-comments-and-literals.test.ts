import { describe, expect, it } from 'vitest';
import { stripCommentsAndLiterals } from '../src/strip-comments-and-literals';

describe('stripCommentsAndLiterals()', () => {
  it('removes line comments', () => {
    expect(stripCommentsAndLiterals('a // comment\nb')).toBe('a  \nb');
  });

  it('removes block comments', () => {
    expect(stripCommentsAndLiterals('a /* c */ b')).toBe('a   b');
  });

  it('leaves code with no comments or literals untouched', () => {
    const code = 'export function GET() { return new Response(); }';
    expect(stripCommentsAndLiterals(code)).toBe(code);
  });

  // The following cases are why a naive comment regex is unsafe: each has a
  // comment-like sequence *inside* a literal that must NOT be read as a comment.

  it('does not treat // inside a string as a comment (URL)', () => {
    expect(stripCommentsAndLiterals('const u = "http://x.com"; foo')).toBe(
      'const u =  ; foo'
    );
  });

  it('does not treat /* inside a string as a comment that swallows later code', () => {
    // This is the original bug: the `*/*` opens a "comment" that runs to the
    // next `*/`, deleting the `module.exports` between them.
    expect(
      stripCommentsAndLiterals(
        "const a = '*/*'; module.exports = h; /* real */"
      )
    ).toBe('const a =  ; module.exports = h;  ');
  });

  it('does not end a string early on an escaped quote', () => {
    // The `\"` is an escape, so the string continues past it — the `/*` inside
    // never starts a comment.
    expect(stripCommentsAndLiterals('a = "x\\" /* y"; b')).toBe('a =  ; b');
  });

  it('consumes a template literal as one token', () => {
    expect(stripCommentsAndLiterals('x = `a */* b`; z')).toBe('x =  ; z');
  });

  it('does not treat // inside a single-quoted string as a comment', () => {
    expect(stripCommentsAndLiterals("const s = 'a//b'; x")).toBe(
      'const s =  ; x'
    );
  });
});
