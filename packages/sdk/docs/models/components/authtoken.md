# AuthToken

Authentication token metadata.

## Example Usage

```typescript
import { AuthToken } from "@vercel/sdk/models/components";

let value: AuthToken = {
  id: "5d9f2ebd38ddca62e5d51e9c1704c72530bdc8bfdd41e782a6687c48399e8391",
  name: "<value>",
  type: "oauth2-token",
  origin: "github",
  expiresAt: 1632816536002,
  activeAt: 1632816536002,
  createdAt: 1632816536002,
};
```

## Fields

| Field                                                                 | Type                                                                  | Required                                                              | Description                                                           | Example                                                               |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `id`                                                                  | *string*                                                              | :heavy_check_mark:                                                    | The unique identifier of the token.                                   | 5d9f2ebd38ddca62e5d51e9c1704c72530bdc8bfdd41e782a6687c48399e8391      |
| `name`                                                                | *string*                                                              | :heavy_check_mark:                                                    | The human-readable name of the token.                                 |                                                                       |
| `type`                                                                | *string*                                                              | :heavy_check_mark:                                                    | The type of the token.                                                | oauth2-token                                                          |
| `origin`                                                              | *string*                                                              | :heavy_minus_sign:                                                    | The origin of how the token was created.                              | github                                                                |
| `scopes`                                                              | *components.Scopes*[]                                                 | :heavy_minus_sign:                                                    | The access scopes granted to the token.                               |                                                                       |
| `expiresAt`                                                           | *number*                                                              | :heavy_minus_sign:                                                    | Timestamp (in milliseconds) of when the token expires.                | 1632816536002                                                         |
| `activeAt`                                                            | *number*                                                              | :heavy_check_mark:                                                    | Timestamp (in milliseconds) of when the token was most recently used. | 1632816536002                                                         |
| `createdAt`                                                           | *number*                                                              | :heavy_check_mark:                                                    | Timestamp (in milliseconds) of when the token was created.            | 1632816536002                                                         |