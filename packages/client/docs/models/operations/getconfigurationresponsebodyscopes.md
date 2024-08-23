# GetConfigurationResponseBodyScopes

## Example Usage

```typescript
import { GetConfigurationResponseBodyScopes } from '@vercel/client/models/operations';

let value: GetConfigurationResponseBodyScopes = {
  added: ['read-write:integration-configuration'],
  upgraded: ['read-write:deployment-check'],
};
```

## Fields

| Field      | Type                                                                                                                 | Required           | Description |
| ---------- | -------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `added`    | [operations.GetConfigurationResponseBodyAdded](../../models/operations/getconfigurationresponsebodyadded.md)[]       | :heavy_check_mark: | N/A         |
| `upgraded` | [operations.GetConfigurationResponseBodyUpgraded](../../models/operations/getconfigurationresponsebodyupgraded.md)[] | :heavy_check_mark: | N/A         |
