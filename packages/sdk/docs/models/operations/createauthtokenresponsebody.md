# CreateAuthTokenResponseBody

Successful response.

## Example Usage

```typescript
import { CreateAuthTokenResponseBody } from "@vercel/sdk/models/operations";

let value: CreateAuthTokenResponseBody = {
  token: {
    id: "5d9f2ebd38ddca62e5d51e9c1704c72530bdc8bfdd41e782a6687c48399e8391",
    name: "<value>",
    type: "oauth2-token",
    origin: "github",
    expiresAt: 1632816536002,
    activeAt: 1632816536002,
    createdAt: 1632816536002,
  },
  bearerToken: "uRKJSTt0L4RaSkiMj41QTkxM",
};
```

## Fields

| Field                                                                                                                                                                     | Type                                                                                                                                                                      | Required                                                                                                                                                                  | Description                                                                                                                                                               | Example                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `token`                                                                                                                                                                   | [components.AuthToken](../../models/components/authtoken.md)                                                                                                              | :heavy_check_mark:                                                                                                                                                        | Authentication token metadata.                                                                                                                                            |                                                                                                                                                                           |
| `bearerToken`                                                                                                                                                             | *string*                                                                                                                                                                  | :heavy_check_mark:                                                                                                                                                        | The authentication token's actual value. This token is only provided in this response, and can never be retrieved again in the future. Be sure to save it somewhere safe! | uRKJSTt0L4RaSkiMj41QTkxM                                                                                                                                                  |