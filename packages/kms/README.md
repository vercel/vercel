# `@vercel/kms`

Runtime KMS signing helpers intended to be used with your Vercel Functions.

`@vercel/kms` calls the Vercel KMS signing API to sign JWTs and arbitrary
messages with an issuer's managed signing key. It authenticates using the
function's [Vercel OIDC token](https://vercel.com/docs/oidc) (fetched
automatically via [`@vercel/oidc`](https://www.npmjs.com/package/@vercel/oidc)).

## Usage

### Signing a token

```typescript
import { signToken } from '@vercel/kms';

// Returns a compact JWT string signed by the issuer.
const token = await signToken({
  issuerId: 'issuer_abc123',
  claims: { sub: 'user_123', scope: 'read:data' },
  ttl: 300, // seconds; defaults to 300
});
```

### Signing a message

```typescript
import { signMessage } from '@vercel/kms';

// `message` is a base64-encoded string. Returns a JOSE Flattened JWS.
const signature = await signMessage({
  issuerId: 'issuer_abc123',
  message: Buffer.from('hello world').toString('base64'),
});
```

### Providing a token explicitly

By default the OIDC token is fetched via `getVercelOidcToken()`. To supply your
own token, pass `token`:

```typescript
const token = await signToken({
  issuerId: 'issuer_abc123',
  token: myOidcToken,
});
```

## API

### `signToken(options)`

Signs a JWT for an issuer.

**Options:**

- `issuerId: string` — The ID of the issuer.
- `claims?: Record<string, unknown>` — Claims to include in the token.
- `headers?: Record<string, unknown>` — Additional JWT headers.
- `ttl?: number | null` — Time-to-live in seconds (default: `300`).
- `token?: string` — Explicit OIDC token; skips automatic retrieval.
- `region?: string` — Region for the regional KMS API host, e.g. `sfo1`, producing `https://api-<region>.vercel.com/v1`. Defaults to the `VERCEL_REGION` environment variable, falling back to `https://api.vercel.com/v1`. Ignored when `baseUrl` is set.
- `baseUrl?: string` — Override the API base URL. Takes precedence over `region`.

Returns `Promise<string>` — the compact JWT.

### `signMessage(options)`

Signs a base64-encoded message for an issuer.

**Options:**

- `issuerId: string` — The ID of the issuer.
- `message: string` — Base64-encoded message to sign.
- `token?: string` — Explicit OIDC token; skips automatic retrieval.
- `region?: string` — Region for the regional KMS API host, e.g. `sfo1`, producing `https://api-<region>.vercel.com/v1`. Defaults to the `VERCEL_REGION` environment variable, falling back to `https://api.vercel.com/v1`. Ignored when `baseUrl` is set.
- `baseUrl?: string` — Override the API base URL. Takes precedence over `region`.

Returns `Promise<FlattenedJWS>` — the JOSE Flattened JWS.
