# [HIGH] Hardcoded SESSION_SECRET fallback ('foobar') silently bypasses user's defensive guard in Hydrogen v2 builds

**File:** [`packages/remix/src/hydrogen.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/remix/src/hydrogen.ts#L100-L118) (lines 100, 101, 102, 109, 117, 118)
**Project:** vercel
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `secret-in-fallback`

## Owners

**Suggested assignee:** `n@n8.io` _(via last-committer)_

## Finding

patchHydrogenServer rewrites the user's `server.ts` fetch handler and prepends an `envCode` block (line 118: `return ${envCode}\n${updatedCodeString}`) that initializes `env` from `process.env` and then injects the hardcoded fallback `if (!env.SESSION_SECRET) { env.SESSION_SECRET = 'foobar'; console.warn(...) }` (lines 100-115). Because this block runs before the user's original handler body, it silently defeats the defensive check that the standard Hydrogen v2 template ships with — `if (!env?.SESSION_SECRET) { throw new Error('SESSION_SECRET environment variable is not set'); }` (see test fixtures `test/fixtures-legacy/10-hydrogen-2/server.ts` lines 31-33 and `11-hydrogen-2-js/server.js` lines 25-27). After patching, `env.SESSION_SECRET` is always truthy, so the user's `throw` is unreachable, the build succeeds, and the deployment goes live signing session cookies with the publicly-known string 'foobar' (used as the secret for `createCookieSessionStorage({ cookie: { secrets: [env.SESSION_SECRET] } })`). The only signal is a runtime `console.warn` buried in deployment logs. An attacker who knows about this default (or who reads this open-source builder) can forge arbitrary signed session cookies for any Hydrogen-on-Vercel deployment that forgot to set SESSION_SECRET, achieving authentication bypass / session impersonation. This is especially dangerous because the user's own defensive code suggests they intended to fail closed.

## Recommendation

Remove SESSION_SECRET from `defaultEnvVars` entirely — it has no safe default. Either (a) hard-fail the build if `SESSION_SECRET` env var is not configured for the project (the right behavior for a security-critical secret), or (b) generate a strong per-deployment random secret and document the consequences, or (c) leave the env var unset so the user's own `throw` runs at startup and the deployment crashes loudly instead of silently using 'foobar'. PUBLIC_STORE_DOMAIN's 'mock.shop' default is fine because it's public and non-security-sensitive; SESSION_SECRET is not.

## Recent committers (`git log`)

- Nathan Rajlich <n@n8.io> (2023-08-14)
