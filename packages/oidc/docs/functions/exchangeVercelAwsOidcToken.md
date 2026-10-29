[**@vercel/oidc**](../README.md)

---

# Function: exchangeVercelAwsOidcToken()

> **exchangeVercelAwsOidcToken**(`options`): [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`string`\>

Defined in: [packages/oidc/src/exchange-vercel-oidc-token.ts:164](https://github.com/vercel/vercel/blob/main/packages/oidc/src/exchange-vercel-oidc-token.ts#L164)

Exchanges a standard Vercel project token for an AWS web identity token whose
subject uses immutable team, project, and environment IDs. The AWS role must
trust this subject format before callers opt in. Errors never fall back to
the source token.

## Parameters

### options

[`ExchangeVercelAwsOidcTokenOptions`](../type-aliases/ExchangeVercelAwsOidcTokenOptions.md)

## Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`string`\>
