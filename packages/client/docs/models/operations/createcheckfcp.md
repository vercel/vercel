# CreateCheckFCP

## Example Usage

```typescript
import { CreateCheckFCP } from '@vercel/client/models/operations';

let value: CreateCheckFCP = {
  value: 4736,
  source: 'web-vitals',
};
```

## Fields

| Field           | Type                                                                         | Required           | Description |
| --------------- | ---------------------------------------------------------------------------- | ------------------ | ----------- |
| `value`         | _number_                                                                     | :heavy_check_mark: | N/A         |
| `previousValue` | _number_                                                                     | :heavy_minus_sign: | N/A         |
| `source`        | [operations.CreateCheckSource](../../models/operations/createchecksource.md) | :heavy_check_mark: | N/A         |
