# ResponseBodyScopesQueue

## Example Usage

```typescript
import { ResponseBodyScopesQueue } from "@vercel/sdk/models/operations";

let value: ResponseBodyScopesQueue = {
  scopes: {
    added: [
      "read-write:project",
    ],
    upgraded: [
      "read-write:log-drain",
    ],
  },
  note: "<value>",
  requestedAt: 2228.64,
};
```

## Fields

| Field                                                                          | Type                                                                           | Required                                                                       | Description                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `scopes`                                                                       | [operations.ResponseBodyScopes](../../models/operations/responsebodyscopes.md) | :heavy_check_mark:                                                             | N/A                                                                            |
| `note`                                                                         | *string*                                                                       | :heavy_check_mark:                                                             | N/A                                                                            |
| `requestedAt`                                                                  | *number*                                                                       | :heavy_check_mark:                                                             | N/A                                                                            |
| `confirmedAt`                                                                  | *number*                                                                       | :heavy_minus_sign:                                                             | N/A                                                                            |