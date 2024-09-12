# GetConfigurationResponseBodyScopesQueue

## Example Usage

```typescript
import { GetConfigurationResponseBodyScopesQueue } from "@vercel/sdk/models/operations";

let value: GetConfigurationResponseBodyScopesQueue = {
  scopes: {
    added: [
      "read-write:integration-configuration",
    ],
    upgraded: [
      "read-write:edge-config",
    ],
  },
  note: "<value>",
  requestedAt: 4218.44,
};
```

## Fields

| Field                                                                                                          | Type                                                                                                           | Required                                                                                                       | Description                                                                                                    |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `scopes`                                                                                                       | [operations.GetConfigurationResponseBodyScopes](../../models/operations/getconfigurationresponsebodyscopes.md) | :heavy_check_mark:                                                                                             | N/A                                                                                                            |
| `note`                                                                                                         | *string*                                                                                                       | :heavy_check_mark:                                                                                             | N/A                                                                                                            |
| `requestedAt`                                                                                                  | *number*                                                                                                       | :heavy_check_mark:                                                                                             | N/A                                                                                                            |
| `confirmedAt`                                                                                                  | *number*                                                                                                       | :heavy_minus_sign:                                                                                             | N/A                                                                                                            |