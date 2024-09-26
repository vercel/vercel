# GetConfigurationResponseBodyIntegrationsScopesQueue

## Example Usage

```typescript
import { GetConfigurationResponseBodyIntegrationsScopesQueue } from "@vercel/sdk/models/operations/getconfiguration.js";

let value: GetConfigurationResponseBodyIntegrationsScopesQueue = {
  scopes: {
    added: [
      "read:deployment",
    ],
    upgraded: [
      "read:monitoring",
    ],
  },
  note: "<value>",
  requestedAt: 4116.26,
};
```

## Fields

| Field                                                                                                                                  | Type                                                                                                                                   | Required                                                                                                                               | Description                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `scopes`                                                                                                                               | [operations.GetConfigurationResponseBodyIntegrationsScopes](../../models/operations/getconfigurationresponsebodyintegrationsscopes.md) | :heavy_check_mark:                                                                                                                     | N/A                                                                                                                                    |
| `note`                                                                                                                                 | *string*                                                                                                                               | :heavy_check_mark:                                                                                                                     | N/A                                                                                                                                    |
| `requestedAt`                                                                                                                          | *number*                                                                                                                               | :heavy_check_mark:                                                                                                                     | N/A                                                                                                                                    |
| `confirmedAt`                                                                                                                          | *number*                                                                                                                               | :heavy_minus_sign:                                                                                                                     | N/A                                                                                                                                    |