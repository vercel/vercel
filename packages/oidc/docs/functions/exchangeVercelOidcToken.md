[**@vercel/oidc**](../README.md)

---

# Function: exchangeVercelOidcToken()

> **exchangeVercelOidcToken**(`options`): [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`string`\>

Defined in: [packages/oidc/src/exchange-vercel-oidc-token.ts:38](https://github.com/vercel/vercel/blob/main/packages/oidc/src/exchange-vercel-oidc-token.ts#L38)

Exchanges a Vercel OIDC token for a Vercel token with a custom audience.

## Parameters

### options

[`ExchangeVercelOidcTokenOptions`](../interfaces/ExchangeVercelOidcTokenOptions.md)

The options for the exchange.

## Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`string`\>

A promise that resolves to the exchanged token.

## Throws

If the token exchange fails.
