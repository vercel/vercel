# DeleteAuthTokenResponseBody

Authentication token successfully deleted.

## Example Usage

```typescript
import { DeleteAuthTokenResponseBody } from "@vercel/sdk/models/operations";

let value: DeleteAuthTokenResponseBody = {
  tokenId: "5d9f2ebd38ddca62e5d51e9c1704c72530bdc8bfdd41e782a6687c48399e8391",
};
```

## Fields

| Field                                                            | Type                                                             | Required                                                         | Description                                                      | Example                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `tokenId`                                                        | *string*                                                         | :heavy_check_mark:                                               | The unique identifier of the token that was deleted.             | 5d9f2ebd38ddca62e5d51e9c1704c72530bdc8bfdd41e782a6687c48399e8391 |