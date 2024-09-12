# DeleteSecretRequest

## Example Usage

```typescript
import { DeleteSecretRequest } from "@vercel/sdk/models/operations";

let value: DeleteSecretRequest = {
  idOrName: "sec_RKc5iV0rV3ZSrFrHiruRno7k",
};
```

## Fields

| Field                                                             | Type                                                              | Required                                                          | Description                                                       | Example                                                           |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `idOrName`                                                        | *string*                                                          | :heavy_check_mark:                                                | The name or the unique identifier to which the secret belongs to. | sec_RKc5iV0rV3ZSrFrHiruRno7k                                      |
| `teamId`                                                          | *string*                                                          | :heavy_minus_sign:                                                | The Team identifier to perform the request on behalf of.          |                                                                   |
| `slug`                                                            | *string*                                                          | :heavy_minus_sign:                                                | The Team slug to perform the request on behalf of.                |                                                                   |