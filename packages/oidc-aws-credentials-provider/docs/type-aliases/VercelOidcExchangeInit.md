[**@vercel/oidc-aws-credentials-provider**](../README.md)

---

# Type Alias: VercelOidcExchangeInit

> **VercelOidcExchangeInit** = \{ `audience`: `string`; `jti?`: `string`; `skipTokenCache?`: `boolean`; \} \| \{ `audience?`: `undefined`; `jti?`: `never`; `skipTokenCache?`: `never`; \}

Defined in: [aws-credentials-provider.ts:30](https://github.com/vercel/vercel/blob/main/packages/oidc-aws-credentials-provider/src/aws-credentials-provider.ts#L30)

The Vercel OIDC token options layered on top of the STS init.

`jti` and `skipTokenCache` are only accepted when `audience` is provided,
because they only take effect while exchanging the token for a custom
audience — without an `audience` there is no exchange.

## Union Members

### Type Literal

\{ `audience`: `string`; `jti?`: `string`; `skipTokenCache?`: `boolean`; \}

#### audience

> **audience**: `string`

Audience to set on the exchanged token.

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

\{ `audience?`: `undefined`; `jti?`: `never`; `skipTokenCache?`: `never`; \}

#### audience?

> `optional` **audience?**: `undefined`

##### Default

```ts
undefined;
```

#### jti?

> `optional` **jti?**: `never`

#### skipTokenCache?

> `optional` **skipTokenCache?**: `never`
