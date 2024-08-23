# ScopesQueue

## Example Usage

```typescript
import { ScopesQueue } from '@vercel/client/models/operations';

let value: ScopesQueue = {
  scopes: {
    added: ['read-write:project'],
    upgraded: ['read-write:log-drain'],
  },
  note: '<value>',
  requestedAt: 2228.64,
};
```

## Fields

| Field         | Type                                                   | Required           | Description |
| ------------- | ------------------------------------------------------ | ------------------ | ----------- |
| `scopes`      | [operations.Scopes](../../models/operations/scopes.md) | :heavy_check_mark: | N/A         |
| `note`        | _string_                                               | :heavy_check_mark: | N/A         |
| `requestedAt` | _number_                                               | :heavy_check_mark: | N/A         |
| `confirmedAt` | _number_                                               | :heavy_minus_sign: | N/A         |
