# GetCheckFCP

## Example Usage

```typescript
import { GetCheckFCP } from '@vercel/client/models/operations';

let value: GetCheckFCP = {
  value: 6706.38,
  source: 'web-vitals',
};
```

## Fields

| Field           | Type                                                                   | Required           | Description |
| --------------- | ---------------------------------------------------------------------- | ------------------ | ----------- |
| `value`         | _number_                                                               | :heavy_check_mark: | N/A         |
| `previousValue` | _number_                                                               | :heavy_minus_sign: | N/A         |
| `source`        | [operations.GetCheckSource](../../models/operations/getchecksource.md) | :heavy_check_mark: | N/A         |
