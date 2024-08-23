# GetConfigurationResponseBodyScopesQueue

## Example Usage

```typescript
import { GetConfigurationResponseBodyScopesQueue } from '@vercel/client/models/operations';

let value: GetConfigurationResponseBodyScopesQueue = {
  scopes: {
    added: ['read-write:otel-endpoint'],
    upgraded: ['read-write:project'],
  },
  note: '<value>',
  requestedAt: 1621.2,
};
```

## Fields

| Field         | Type                                                                                                           | Required           | Description |
| ------------- | -------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `scopes`      | [operations.GetConfigurationResponseBodyScopes](../../models/operations/getconfigurationresponsebodyscopes.md) | :heavy_check_mark: | N/A         |
| `note`        | _string_                                                                                                       | :heavy_check_mark: | N/A         |
| `requestedAt` | _number_                                                                                                       | :heavy_check_mark: | N/A         |
| `confirmedAt` | _number_                                                                                                       | :heavy_minus_sign: | N/A         |
