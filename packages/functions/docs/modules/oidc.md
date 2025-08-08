# Module: oidc

## Table of contents

### Interfaces

- [AwsCredentialsProviderInit](../interfaces/oidc.AwsCredentialsProviderInit.md)

### Functions

- [awsCredentialsProvider](oidc.md#awscredentialsprovider)
- [getVercelOidcToken](oidc.md#getverceloidctoken)
- [getVercelOidcTokenSync](oidc.md#getverceloidctokensync)

## Functions

### awsCredentialsProvider

▸ **awsCredentialsProvider**(`init`): `AwsCredentialIdentityProvider`

#### Parameters

| Name   | Type                                                                             |
| :----- | :------------------------------------------------------------------------------- |
| `init` | [`AwsCredentialsProviderInit`](../interfaces/oidc.AwsCredentialsProviderInit.md) |

#### Returns

`AwsCredentialIdentityProvider`

#### Defined in

[packages/functions/src/oidc/aws-credentials-provider.ts:70](https://github.com/vercel/vercel/blob/main/packages/functions/src/oidc/aws-credentials-provider.ts#L70)

---

### getVercelOidcToken

▸ **getVercelOidcToken**(): [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`string`\>

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

#### Returns

[`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`string`\>

A promise that resolves to the OIDC token.

#### Defined in

packages/oidc/dist/get-vercel-oidc-token.d.ts:27

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

packages/oidc/dist/get-vercel-oidc-token.d.ts:49
