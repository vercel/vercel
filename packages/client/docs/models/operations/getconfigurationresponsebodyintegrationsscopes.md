# GetConfigurationResponseBodyIntegrationsScopes

## Example Usage

```typescript
import { GetConfigurationResponseBodyIntegrationsScopes } from '@vercel/client/models/operations';

let value: GetConfigurationResponseBodyIntegrationsScopes = {
  added: ['read-write:deployment-check'],
  upgraded: ['read-write:deployment'],
};
```

## Fields

| Field      | Type                                                                                                                                         | Required           | Description |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `added`    | [operations.GetConfigurationResponseBodyIntegrationsAdded](../../models/operations/getconfigurationresponsebodyintegrationsadded.md)[]       | :heavy_check_mark: | N/A         |
| `upgraded` | [operations.GetConfigurationResponseBodyIntegrationsUpgraded](../../models/operations/getconfigurationresponsebodyintegrationsupgraded.md)[] | :heavy_check_mark: | N/A         |
