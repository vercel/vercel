# @vercel/oidc

## Table of contents

### Classes

- [NoAuthError](classes/NoAuthError.md)
- [RefreshFailedError](classes/RefreshFailedError.md)
- [TokenExpiredError](classes/TokenExpiredError.md)

### Interfaces

- [AuthConfig](interfaces/AuthConfig.md)
- [GetVercelOidcTokenOptions](interfaces/GetVercelOidcTokenOptions.md)

### Functions

- [getContext](README.md#getcontext)
- [getVercelCliToken](README.md#getvercelclitoken)
- [getVercelOidcToken](README.md#getverceloidctoken)
- [getVercelOidcTokenSync](README.md#getverceloidctokensync)
- [isValidAccessToken](README.md#isvalidaccesstoken)
- [readAuthConfig](README.md#readauthconfig)
- [writeAuthConfig](README.md#writeauthconfig)

## Functions

### getContext

▸ **getContext**(): `Context`

#### Returns

`Context`

#### Defined in

[packages/oidc/src/get-context.ts:7](https://github.com/vercel/vercel/blob/main/packages/oidc/src/get-context.ts#L7)

---

### getVercelCliToken

▸ **getVercelCliToken**(): [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`string`\>

#### Returns

[`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`string`\>

#### Defined in

[packages/oidc/src/token-util.ts:27](https://github.com/vercel/vercel/blob/main/packages/oidc/src/token-util.ts#L27)

---

### getVercelOidcToken

▸ **getVercelOidcToken**(`options?`): [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`string`\>

Gets the current OIDC token from the request context or the environment variable.

Do not cache this value, as it is subject to change in production!

This function is used to retrieve the OIDC token from the request context or the environment variable.
It checks for the `x-vercel-oidc-token` header in the request context and falls back to the `VERCEL_OIDC_TOKEN` environment variable if the header is not present.

Unlike the `getVercelOidcTokenSync` function, this function will refresh the token if it is expired in a development environment.

**`Throws`**

If the `x-vercel-oidc-token` header is missing from the request context and the environment variable `VERCEL_OIDC_TOKEN` is not set. If the token
is expired in a development environment, will also throw an error if the token cannot be refreshed: no CLI credentials are available, CLI credentials are expired, no project configuration is available
or the token refresh request fails.

**`Example`**

```js
// Using the OIDC token
getVercelOidcToken()
  .then(token => {
    console.log('OIDC Token:', token);
  })
  .catch(error => {
    console.error('Error:', error.message);
  });
```

**`Example`**

```js
// Using the OIDC token with explicit team and project
getVercelOidcToken({ teamId: 'team_abc', projectId: 'prj_xyz' })
  .then(token => {
    console.log('OIDC Token:', token);
  })
  .catch(error => {
    console.error('Error:', error.message);
  });
```

#### Parameters

| Name       | Type                                                                   | Description                                 |
| :--------- | :--------------------------------------------------------------------- | :------------------------------------------ |
| `options?` | [`GetVercelOidcTokenOptions`](interfaces/GetVercelOidcTokenOptions.md) | Optional configuration for token retrieval. |

#### Returns

[`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`string`\>

A promise that resolves to the OIDC token.

#### Defined in

[packages/oidc/src/get-vercel-oidc-token.ts:58](https://github.com/vercel/vercel/blob/main/packages/oidc/src/get-vercel-oidc-token.ts#L58)

---

### getVercelOidcTokenSync

▸ **getVercelOidcTokenSync**(): `string`

Gets the current OIDC token from the request context or the environment variable.

Do not cache this value, as it is subject to change in production!

This function is used to retrieve the OIDC token from the request context or the environment variable.
It checks for the `x-vercel-oidc-token` header in the request context and falls back to the `VERCEL_OIDC_TOKEN` environment variable if the header is not present.

This function will not refresh the token if it is expired. For refreshing the token, use the @{link getVercelOidcToken} function.

**`Throws`**

If the `x-vercel-oidc-token` header is missing from the request context and the environment variable `VERCEL_OIDC_TOKEN` is not set.

**`Example`**

```js
// Using the OIDC token
const token = getVercelOidcTokenSync();
console.log('OIDC Token:', token);
```

#### Returns

`string`

The OIDC token.

#### Defined in

[packages/oidc/src/get-vercel-oidc-token.ts:115](https://github.com/vercel/vercel/blob/main/packages/oidc/src/get-vercel-oidc-token.ts#L115)

---

### isValidAccessToken

▸ **isValidAccessToken**(`authConfig`): `boolean`

Check if an access token is valid (not expired)
Copied from packages/cli/src/util/client.ts:72-81

#### Parameters

| Name         | Type                                     |
| :----------- | :--------------------------------------- |
| `authConfig` | [`AuthConfig`](interfaces/AuthConfig.md) |

#### Returns

`boolean`

#### Defined in

[packages/oidc/src/auth-config.ts:75](https://github.com/vercel/vercel/blob/main/packages/oidc/src/auth-config.ts#L75)

---

### readAuthConfig

▸ **readAuthConfig**(): [`AuthConfig`](interfaces/AuthConfig.md) \| `null`

Read the auth config from disk
Returns null if the file doesn't exist or cannot be read

#### Returns

[`AuthConfig`](interfaces/AuthConfig.md) \| `null`

#### Defined in

[packages/oidc/src/auth-config.ts:39](https://github.com/vercel/vercel/blob/main/packages/oidc/src/auth-config.ts#L39)

---

### writeAuthConfig

▸ **writeAuthConfig**(`config`): `void`

Write the auth config to disk with proper permissions

#### Parameters

| Name     | Type                                     |
| :------- | :--------------------------------------- |
| `config` | [`AuthConfig`](interfaces/AuthConfig.md) |

#### Returns

`void`

#### Defined in

[packages/oidc/src/auth-config.ts:58](https://github.com/vercel/vercel/blob/main/packages/oidc/src/auth-config.ts#L58)
