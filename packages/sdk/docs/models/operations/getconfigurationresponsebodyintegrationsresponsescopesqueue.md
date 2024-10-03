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
      "read-write:otel-endpoint",
    ],
  },
  note: "<value>",
  requestedAt: 329.45,
};
```

## Fields

| Field                                                                                                                                                  | Type                                                                                                                                                   | Required                                                                                                                                               | Description                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scopes`                                                                                                                                               | [operations.GetConfigurationResponseBodyIntegrationsResponseScopes](../../models/operations/getconfigurationresponsebodyintegrationsresponsescopes.md) | :heavy_check_mark:                                                                                                                                     | N/A                                                                                                                                                    |
| `note`                                                                                                                                                 | *string*                                                                                                                                               | :heavy_check_mark:                                                                                                                                     | N/A                                                                                                                                                    |
| `requestedAt`                                                                                                                                          | *number*                                                                                                                                               | :heavy_check_mark:                                                                                                                                     | N/A                                                                                                                                                    |
| `confirmedAt`                                                                                                                                          | *number*                                                                                                                                               | :heavy_minus_sign:                                                                                                                                     | N/A                                                                                                                                                    |