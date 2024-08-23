# ResponseBodyScopesQueue

## Example Usage

```typescript
import { ResponseBodyScopesQueue } from '@vercel/client/models/operations';

let value: ResponseBodyScopesQueue = {
  scopes: {
    added: ['read:monitoring'],
    upgraded: ['read:deployment'],
  },
  note: '<value>',
  requestedAt: 3321.91,
};
```

## Fields

| Field         | Type                                                                           | Required           | Description |
| ------------- | ------------------------------------------------------------------------------ | ------------------ | ----------- |
| `scopes`      | [operations.ResponseBodyScopes](../../models/operations/responsebodyscopes.md) | :heavy_check_mark: | N/A         |
| `note`        | _string_                                                                       | :heavy_check_mark: | N/A         |
| `requestedAt` | _number_                                                                       | :heavy_check_mark: | N/A         |
| `confirmedAt` | _number_                                                                       | :heavy_minus_sign: | N/A         |
