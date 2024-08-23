# GetSecretRequest

## Example Usage

```typescript
import { GetSecretRequest } from '@vercel/client/models/operations';

let value: GetSecretRequest = {
  idOrName: 'sec_RKc5iV0rV3ZSrFrHiruRno7k',
  decrypt: 'true',
};
```

## Fields

| Field      | Type                                                                         | Required           | Description                                                                                                                        | Example                      |
| ---------- | ---------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `idOrName` | _string_                                                                     | :heavy_check_mark: | The name or the unique identifier to which the secret belongs to.                                                                  | sec_RKc5iV0rV3ZSrFrHiruRno7k |
| `decrypt`  | [operations.QueryParamDecrypt](../../models/operations/queryparamdecrypt.md) | :heavy_minus_sign: | Whether to try to decrypt the value of the secret. Only works if `decryptable` has been set to `true` when the secret was created. | true                         |
| `teamId`   | _string_                                                                     | :heavy_minus_sign: | The Team identifier to perform the request on behalf of.                                                                           |                              |
| `slug`     | _string_                                                                     | :heavy_minus_sign: | The Team slug to perform the request on behalf of.                                                                                 |                              |
