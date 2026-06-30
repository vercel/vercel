// Each pattern matches one "thing to neutralize" as a single token. They are
// kept separate (and individually commented) so the combined matcher below is
// readable; `COMMENT_OR_LITERAL` is exactly their `|`-joined alternation.
//
// Two non-obvious details, both so a token never *fails* to match:
//   * `\\[\s\S]` (backslash + ANY char, incl. a newline) skips escapes —
//     including `\`-newline line continuations — so a quote right after an
//     escape doesn't end the literal early.
//   * The closing delimiter is optional (`"?`, `'?`, `` `? ``, and `\*\/|$` for
//     block comments). On valid code every literal is terminated, so the greedy
//     match still takes the real closing delimiter — behavior is unchanged. But
//     an *unterminated* literal (malformed input) then matches in one pass to
//     end-of-input instead of failing; without this, each later quote restarts
//     a scan-to-EOF that fails, which is O(n^2) on a run of escaped quotes.
const BLOCK_COMMENT = /\/\*[\s\S]*?(?:\*\/|$)/; //        a /* ... */ block comment
const LINE_COMMENT = /\/\/[^\n]*/; //                     a // ... line comment
const DOUBLE_QUOTED = /"(?:\\[\s\S]|[^"\\])*"?/; //       a "..." string
const SINGLE_QUOTED = /'(?:\\[\s\S]|[^'\\])*'?/; //       a '...' string
const TEMPLATE_LITERAL = /`(?:\\[\s\S]|[^`\\])*`?/; //    a `...` template literal

const COMMENT_OR_LITERAL = new RegExp(
  [BLOCK_COMMENT, LINE_COMMENT, DOUBLE_QUOTED, SINGLE_QUOTED, TEMPLATE_LITERAL]
    .map(pattern => pattern.source)
    .join('|'),
  'g'
);

/**
 * Replace comments and string / template literals with single spaces, leaving
 * only the code structure behind.
 *
 * Comments and literals are matched by one alternation. Because a literal is
 * matched as a single token, the engine consumes it whole before it can look
 * inside — so a comment-like sequence that appears inside a string (for
 * example an `Accept` header value containing a wildcard media range, or a URL
 * with `//`) is never treated as the start of a comment. Literals are blanked
 * rather than preserved so their contents cannot be misread as code either.
 *
 * This is intentionally not aware of regex literals: an unescaped `/` cannot
 * appear inside a regex body, so a comment-opening slash-star sequence cannot
 * occur there, and callers only test the result for plain code-level tokens.
 */
export function stripCommentsAndLiterals(content: string): string {
  return content.replace(COMMENT_OR_LITERAL, ' ');
}
