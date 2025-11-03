[**@vercel/functions**](../../README.md)

---

# ~~Function: getVercelOidcTokenSync()~~

> **getVercelOidcTokenSync**(): `string`

Defined in: packages/oidc/dist/get-vercel-oidc-token.d.ts:49

Gets the current OIDC token from the request context or the environment variable.

Do not cache this value, as it is subject to change in production!

This function is used to retrieve the OIDC token from the request context or the environment variable.
It checks for the `x-vercel-oidc-token` header in the request context and falls back to the `VERCEL_OIDC_TOKEN` environment variable if the header is not present.

This function will not refresh the token if it is expired. For refreshing the token, use the @{link getVercelOidcToken} function.

## Returns

`string`

The OIDC token.

## Throws

If the `x-vercel-oidc-token` header is missing from the request context and the environment variable `VERCEL_OIDC_TOKEN` is not set.

## Example

```js
// Using the OIDC token
const token = getVercelOidcTokenSync();
console.log('OIDC Token:', token);
```
