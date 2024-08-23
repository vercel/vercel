# CreateCheckCLS

## Example Usage

```typescript
import { CreateCheckCLS } from '@vercel/client/models/operations';

let value: CreateCheckCLS = {
  value: 1863.32,
  source: 'web-vitals',
};
```

## Fields

| Field           | Type                                                                                                     | Required           | Description |
| --------------- | -------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `value`         | _number_                                                                                                 | :heavy_check_mark: | N/A         |
| `previousValue` | _number_                                                                                                 | :heavy_minus_sign: | N/A         |
| `source`        | [operations.CreateCheckChecksResponseSource](../../models/operations/createcheckchecksresponsesource.md) | :heavy_check_mark: | N/A         |
