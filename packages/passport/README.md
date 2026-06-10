# @vercel/passport

Runtime helpers for reading Passport identity inside Vercel Functions.

## Usage

```ts
import { getIdentity } from '@vercel/passport';

export async function GET() {
  const identity = await getIdentity();

  if (!identity) {
    return Response.json({ authenticated: false }, { status: 401 });
  }

  return Response.json({
    authenticated: true,
    externalSubject: identity.externalSubject,
    subject: identity.subject,
  });
}
```

In local development, tests, or environments without Vercel request context, pass headers and cookies explicitly:

```ts
import { getIdentity } from '@vercel/passport';
import { cookies, headers } from 'next/headers';

export async function GET() {
  const identity = await getIdentity({
    cookies: await cookies(),
    headers: await headers(),
  });

  return Response.json({ identity });
}
```

`getIdentity` reads the `x-vercel-oidc-passport-token` header injected by
Vercel after Passport validates the visitor. It can also fall back to the
`_vercel_passport` cookie.

By default, request tokens are verified against Vercel's JWKS. The helper
accepts the current `https://oidc.vercel.com/{owner}` issuer and the dedicated
`https://passport.vercel.com/{owner}` issuer. In both cases, it validates the
Passport-specific token shape so regular Vercel OIDC tokens are not accepted as
Passport identities.

## Local development

Local development usually does not have a real `_vercel_passport` cookie or
`x-vercel-oidc-passport-token` header, because those are created by Passport in
Vercel's edge network. In local development, `getIdentity()` returns a hardcoded
Passport-shaped test identity and logs a warning the first time it does so.

The default test identity uses:

```txt
externalSubject: test-user
email: test-user@passport.local
name: Test User
```

Override individual fields with:

```bash
VERCEL_PASSPORT_DEV_OWNER=acme
VERCEL_PASSPORT_DEV_CONNECTOR_ID=scl_dev
VERCEL_PASSPORT_DEV_EXTERNAL_SUB=user_dev
VERCEL_PASSPORT_DEV_PROJECT=my-project
```

Disable the local test identity with:

```bash
VERCEL_PASSPORT_DEV=0
```

or:

```ts
const identity = await getIdentity(undefined, { development: false });
```

Or provide the full payload yourself:

```ts
const identity = await getIdentity(undefined, {
  localIdentity: {
    typ: 'passport',
    owner: 'local',
    external_sub: 'local-user',
    sub: 'owner:local:connector:local:principal:local-user',
    connector_id: 'local',
  },
});
```

Development identities are ignored when `NODE_ENV=production`.

You can also copy a Passport token from a deployed request and pass it directly
for debugging:

```ts
const identity = await getIdentity(
  { token: process.env.VERCEL_PASSPORT_TOKEN },
  { verify: false }
);
```

Only disable verification for local debugging. In deployed code, use the default
verification behavior.
