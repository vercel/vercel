# GetConfigurationResponseBodyIntegrationsScopesQueue

## Example Usage

```typescript
import { GetConfigurationResponseBodyIntegrationsScopesQueue } from '@vercel/client/models/operations';

let value: GetConfigurationResponseBodyIntegrationsScopesQueue = {
  scopes: {
    added: ['read:integration-configuration'],
    upgraded: ['read-write:integration-configuration'],
  },
  note: '<value>',
  requestedAt: 249.44,
};
```

## Fields

| Field         | Type                                                                                                                                   | Required           | Description |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `scopes`      | [operations.GetConfigurationResponseBodyIntegrationsScopes](../../models/operations/getconfigurationresponsebodyintegrationsscopes.md) | :heavy_check_mark: | N/A         |
| `note`        | _string_                                                                                                                               | :heavy_check_mark: | N/A         |
| `requestedAt` | _number_                                                                                                                               | :heavy_check_mark: | N/A         |
| `confirmedAt` | _number_                                                                                                                               | :heavy_minus_sign: | N/A         |
