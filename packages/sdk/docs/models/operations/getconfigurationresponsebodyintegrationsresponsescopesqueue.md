# GetConfigurationResponseBodyIntegrationsResponseScopesQueue

## Example Usage

```typescript
import { GetConfigurationResponseBodyIntegrationsResponseScopesQueue } from "@vercel/sdk/models/operations";

let value: GetConfigurationResponseBodyIntegrationsResponseScopesQueue = {
  scopes: {
    added: [
      "read-write:project",
    ],
    upgraded: [
      "read:deployment",
    ],
  },
  note: "<value>",
  requestedAt: 551.07,
};
```

## Fields

| Field                                                                                                                                                  | Type                                                                                                                                                   | Required                                                                                                                                               | Description                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scopes`                                                                                                                                               | [operations.GetConfigurationResponseBodyIntegrationsResponseScopes](../../models/operations/getconfigurationresponsebodyintegrationsresponsescopes.md) | :heavy_check_mark:                                                                                                                                     | N/A                                                                                                                                                    |
| `note`                                                                                                                                                 | *string*                                                                                                                                               | :heavy_check_mark:                                                                                                                                     | N/A                                                                                                                                                    |
| `requestedAt`                                                                                                                                          | *number*                                                                                                                                               | :heavy_check_mark:                                                                                                                                     | N/A                                                                                                                                                    |
| `confirmedAt`                                                                                                                                          | *number*                                                                                                                                               | :heavy_minus_sign:                                                                                                                                     | N/A                                                                                                                                                    |