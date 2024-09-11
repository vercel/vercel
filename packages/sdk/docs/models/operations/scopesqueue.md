# ScopesQueue

## Example Usage

```typescript
import { ScopesQueue } from "@vercel/sdk/models/operations";

let value: ScopesQueue = {
  scopes: {
    added: [
      "read:integration-configuration",
    ],
    upgraded: [
      "read-write:integration-configuration",
    ],
  },
  note: "<value>",
  requestedAt: 249.44,
};
```

## Fields

| Field                                                  | Type                                                   | Required                                               | Description                                            |
| ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| `scopes`                                               | [operations.Scopes](../../models/operations/scopes.md) | :heavy_check_mark:                                     | N/A                                                    |
| `note`                                                 | *string*                                               | :heavy_check_mark:                                     | N/A                                                    |
| `requestedAt`                                          | *number*                                               | :heavy_check_mark:                                     | N/A                                                    |
| `confirmedAt`                                          | *number*                                               | :heavy_minus_sign:                                     | N/A                                                    |