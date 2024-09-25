# GetConfigurationResponseBodyIntegrationsResponseScopesQueue

## Example Usage

```typescript
import { GetConfigurationResponseBodyIntegrationsResponseScopesQueue } from "@vercel/sdk/models/operations/getconfiguration.js";

let value: GetConfigurationResponseBodyIntegrationsResponseScopesQueue = {
  scopes: {
    added: [
      "read-write:domain",
    ],
    upgraded: [
      "read-write:edge-config",
    ],
  },
  note: "<value>",
  requestedAt: 3730.55,
};
```

## Fields

| Field                                                                                                                                                  | Type                                                                                                                                                   | Required                                                                                                                                               | Description                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scopes`                                                                                                                                               | [operations.GetConfigurationResponseBodyIntegrationsResponseScopes](../../models/operations/getconfigurationresponsebodyintegrationsresponsescopes.md) | :heavy_check_mark:                                                                                                                                     | N/A                                                                                                                                                    |
| `note`                                                                                                                                                 | *string*                                                                                                                                               | :heavy_check_mark:                                                                                                                                     | N/A                                                                                                                                                    |
| `requestedAt`                                                                                                                                          | *number*                                                                                                                                               | :heavy_check_mark:                                                                                                                                     | N/A                                                                                                                                                    |
| `confirmedAt`                                                                                                                                          | *number*                                                                                                                                               | :heavy_minus_sign:                                                                                                                                     | N/A                                                                                                                                                    |