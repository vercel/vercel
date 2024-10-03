# ResponseBodyScopesQueue

## Example Usage

```typescript
import { ResponseBodyScopesQueue } from "@vercel/sdk/models/operations/getconfigurations.js";

let value: ResponseBodyScopesQueue = {
  scopes: {
    added: [
      "read:integration-configuration",
    ],
    upgraded: [
      "read-write:deployment-check",
    ],
  },
  note: "<value>",
  requestedAt: 3390.95,
};
```

## Fields

| Field                                                                          | Type                                                                           | Required                                                                       | Description                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `scopes`                                                                       | [operations.ResponseBodyScopes](../../models/operations/responsebodyscopes.md) | :heavy_check_mark:                                                             | N/A                                                                            |
| `note`                                                                         | *string*                                                                       | :heavy_check_mark:                                                             | N/A                                                                            |
| `requestedAt`                                                                  | *number*                                                                       | :heavy_check_mark:                                                             | N/A                                                                            |
| `confirmedAt`                                                                  | *number*                                                                       | :heavy_minus_sign:                                                             | N/A                                                                            |