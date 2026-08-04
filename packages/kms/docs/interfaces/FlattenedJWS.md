[**@vercel/kms**](../README.md)

---

# Interface: FlattenedJWS

Defined in: [packages/kms/src/request.ts:36](https://github.com/vercel/vercel/blob/main/packages/kms/src/request.ts#L36)

A JOSE Flattened JWS, as returned by the message-signing endpoint.

## See

https://datatracker.ietf.org/doc/html/rfc7515#section-7.2.2

## Properties

### header?

> `optional` **header?**: [`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type)\<`string`, `unknown`\>

Defined in: [packages/kms/src/request.ts:44](https://github.com/vercel/vercel/blob/main/packages/kms/src/request.ts#L44)

Optional unprotected JWS header.

---

### payload

> **payload**: `string`

Defined in: [packages/kms/src/request.ts:38](https://github.com/vercel/vercel/blob/main/packages/kms/src/request.ts#L38)

Base64url-encoded JWS payload.

---

### protected?

> `optional` **protected?**: `string`

Defined in: [packages/kms/src/request.ts:42](https://github.com/vercel/vercel/blob/main/packages/kms/src/request.ts#L42)

Base64url-encoded protected header.

---

### signature

> **signature**: `string`

Defined in: [packages/kms/src/request.ts:40](https://github.com/vercel/vercel/blob/main/packages/kms/src/request.ts#L40)

Base64url-encoded JWS signature.
