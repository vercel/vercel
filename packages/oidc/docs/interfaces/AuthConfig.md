# Interface: AuthConfig

Auth configuration stored in ~/.../com.vercel.cli/auth.json

## Table of contents

### Properties

- [expiresAt](AuthConfig.md#expiresat)
- [refreshToken](AuthConfig.md#refreshtoken)
- [skipWrite](AuthConfig.md#skipwrite)
- [token](AuthConfig.md#token)

## Properties

### expiresAt

• `Optional` **expiresAt**: `number`

The absolute time (seconds) when the token expires.
Used to optimistically check if the token is still valid.

#### Defined in

[packages/oidc/src/auth-config.ts:17](https://github.com/vercel/vercel/blob/main/packages/oidc/src/auth-config.ts#L17)

---

### refreshToken

• `Optional` **refreshToken**: `string`

A `refresh_token` obtained using the OAuth Device Authorization flow.

#### Defined in

[packages/oidc/src/auth-config.ts:12](https://github.com/vercel/vercel/blob/main/packages/oidc/src/auth-config.ts#L12)

---

### skipWrite

• `Optional` **skipWrite**: `boolean`

Whether to skip writing this config to disk.

#### Defined in

[packages/oidc/src/auth-config.ts:19](https://github.com/vercel/vercel/blob/main/packages/oidc/src/auth-config.ts#L19)

---

### token

• `Optional` **token**: `string`

An `access_token` obtained using the OAuth Device Authorization flow.

#### Defined in

[packages/oidc/src/auth-config.ts:10](https://github.com/vercel/vercel/blob/main/packages/oidc/src/auth-config.ts#L10)
