# GetAuthTokenResponseBody

Successful response.

## Example Usage

```typescript
import { GetAuthTokenResponseBody } from "@vercel/sdk/models/operations";

let value: GetAuthTokenResponseBody = {
  token: {
    id: "5d9f2ebd38ddca62e5d51e9c1704c72530bdc8bfdd41e782a6687c48399e8391",
    name: "<value>",
    type: "oauth2-token",
    origin: "github",
    expiresAt: 1632816536002,
    activeAt: 1632816536002,
    createdAt: 1632816536002,
  },
};
```

## Fields

| Field                                                        | Type                                                         | Required                                                     | Description                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| `token`                                                      | [components.AuthToken](../../models/components/authtoken.md) | :heavy_check_mark:                                           | Authentication token metadata.                               |