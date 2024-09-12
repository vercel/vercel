# GetConfigurationResponseBodyIntegrationsScopesQueue

## Example Usage

```typescript
import { GetConfigurationResponseBodyIntegrationsScopesQueue } from "@vercel/sdk/models/operations";

let value: GetConfigurationResponseBodyIntegrationsScopesQueue = {
  scopes: {
    added: [
      "read:deployment",
    ],
    upgraded: [
      "read:project",
    ],
  },
  note: "<value>",
  requestedAt: 1995.96,
};
```

## Fields

| Field                                                                                                                                  | Type                                                                                                                                   | Required                                                                                                                               | Description                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `scopes`                                                                                                                               | [operations.GetConfigurationResponseBodyIntegrationsScopes](../../models/operations/getconfigurationresponsebodyintegrationsscopes.md) | :heavy_check_mark:                                                                                                                     | N/A                                                                                                                                    |
| `note`                                                                                                                                 | *string*                                                                                                                               | :heavy_check_mark:                                                                                                                     | N/A                                                                                                                                    |
| `requestedAt`                                                                                                                          | *number*                                                                                                                               | :heavy_check_mark:                                                                                                                     | N/A                                                                                                                                    |
| `confirmedAt`                                                                                                                          | *number*                                                                                                                               | :heavy_minus_sign:                                                                                                                     | N/A                                                                                                                                    |