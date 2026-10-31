[**@vercel/kms**](../README.md)

---

# Interface: SignJWTResult

Defined in: [packages/kms/src/sign-jwt.ts:38](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-jwt.ts#L38)

Result of [signJWT](../functions/signJWT.md).

## Properties

### algorithm

> **algorithm**: `string`

Defined in: [packages/kms/src/sign-jwt.ts:44](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-jwt.ts#L44)

Algorithm of the signing key.

---

### fingerprint

> **fingerprint**: `string`

Defined in: [packages/kms/src/sign-jwt.ts:48](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-jwt.ts#L48)

SHA-256 fingerprint of the signing key's public key (`SHA256:<base64>`).

---

### keyId

> **keyId**: `string`

Defined in: [packages/kms/src/sign-jwt.ts:42](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-jwt.ts#L42)

Key id of the signing key. Matches the JWKS `kid`.

---

### token

> **token**: `string`

Defined in: [packages/kms/src/sign-jwt.ts:40](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-jwt.ts#L40)

Compact JWT signed by the issuer's active signing key.
