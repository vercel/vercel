[**@vercel/oidc-aws-credentials-provider**](../README.md)

---

# Type Alias: VercelOidcExchangeInit

> **VercelOidcExchangeInit** = \{ `audience?`: `never`; `enableProjectIdentity`: `true`; `jti?`: `never`; `skipTokenCache?`: `boolean`; \} \| \{ `audience`: `string`; `enableProjectIdentity?`: `false`; `jti?`: `string`; `skipTokenCache?`: `boolean`; \} \| \{ `audience?`: `undefined`; `enableProjectIdentity?`: `false`; `jti?`: `never`; `skipTokenCache?`: `never`; \}

Defined in: [aws-credentials-provider.ts:30](https://github.com/vercel/vercel/blob/main/packages/oidc-aws-credentials-provider/src/aws-credentials-provider.ts#L30)

The Vercel OIDC token options layered on top of the STS init.

Custom-audience exchanges accept `jti` and `skipTokenCache`. Immutable
project identity is a separate exchange mode that accepts `skipTokenCache`
without a custom audience.

## Union Members

### Type Literal

\{ `audience?`: `never`; `enableProjectIdentity`: `true`; `jti?`: `never`; `skipTokenCache?`: `boolean`; \}

#### audience?

> `optional` **audience?**: `never`

#### enableProjectIdentity

> **enableProjectIdentity**: `true`

Use an immutable project identity for AWS roles prepared for this token
format. Standard tokens remain unchanged. Cannot be combined with a
custom audience or JTI.

#### jti?

> `optional` **jti?**: `never`

#### skipTokenCache?

> `optional` **skipTokenCache?**: `boolean`

---

### Type Literal

\{ `audience`: `string`; `enableProjectIdentity?`: `false`; `jti?`: `string`; `skipTokenCache?`: `boolean`; \}

#### audience

> **audience**: `string`

Audience to set on the exchanged token.

#### enableProjectIdentity?

> `optional` **enableProjectIdentity?**: `false`

#### jti?

> `optional` **jti?**: `string`

Optional JTI to set on the exchanged token.

##### Default

```ts
undefined;
```

#### skipTokenCache?

> `optional` **skipTokenCache?**: `boolean`

When `true`, bypasses the in-memory OIDC token cache so a fresh token is
exchanged on each STS credential refresh. This only affects the Vercel
OIDC token — it does not influence how the AWS SDK caches the STS-issued
credentials (governed by `durationSeconds`).

##### Default

```ts
false;
```

---

### Type Literal

\{ `audience?`: `undefined`; `enableProjectIdentity?`: `false`; `jti?`: `never`; `skipTokenCache?`: `never`; \}

#### audience?

> `optional` **audience?**: `undefined`

##### Default

```ts
undefined;
```

#### enableProjectIdentity?

> `optional` **enableProjectIdentity?**: `false`

#### jti?

> `optional` **jti?**: `never`

#### skipTokenCache?

> `optional` **skipTokenCache?**: `never`
