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

  // Multi-line forms: each construct must be consumed across newlines.

  it('removes a multi-line block comment', () => {
    expect(stripCommentsAndLiterals('a /* l1\nl2\nl3 */ b')).toBe('a   b');
  });

  it('consumes a multi-line template literal as one token', () => {
    expect(stripCommentsAndLiterals('x = `l1\nl2\nl3`; y')).toBe('x =  ; y');
  });

  it('does not let a multi-line template (with */) leak as code', () => {
    expect(
      stripCommentsAndLiterals('const t = `oops */\nmodule.exports = x`;\ny')
    ).toBe('const t =  ;\ny');
  });

  it('consumes a backslash line-continued string as one token', () => {
    // The `\`-newline is a line continuation, so the string spans both lines
    // and the `/*` inside it never starts a comment that swallows later code.
    expect(
      stripCommentsAndLiterals('const x = "l1 /* \\\nl2"; module.exports = h;')
    ).toBe('const x =  ; module.exports = h;');
  });

  // Malformed (unterminated) input: the literal/comment runs to end-of-input in
  // a single pass rather than failing and re-scanning (see the O(n^2) note in
  // the implementation). Valid code is unaffected.

  it('consumes an unterminated string to end of input', () => {
    expect(stripCommentsAndLiterals('a = "unterminated')).toBe('a =  ');
  });

  it('consumes an unterminated block comment to end of input', () => {
    expect(stripCommentsAndLiterals('a /* unterminated\nmore')).toBe('a  ');
  });

  it('stays linear on pathological input (no catastrophic backtracking)', () => {
    // A 200k-char run of escaped quotes is the worst case for a naive
    // string matcher. Must complete in well under a second.
    const pathological = '"\\'.repeat(100_000);
    const start = performance.now();
    stripCommentsAndLiterals(pathological);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
