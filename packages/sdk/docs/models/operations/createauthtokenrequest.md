# CreateAuthTokenRequest

## Example Usage

```typescript
import { CreateAuthTokenRequest } from "@vercel/sdk/models/operations";

let value: CreateAuthTokenRequest = {};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `teamId`                                                 | *string*                                                 | :heavy_minus_sign:                                       | The Team identifier to perform the request on behalf of. |
| `slug`                                                   | *string*                                                 | :heavy_minus_sign:                                       | The Team slug to perform the request on behalf of.       |
| `requestBody`                                            | *operations.CreateAuthTokenRequestBody*                  | :heavy_minus_sign:                                       | N/A                                                      |