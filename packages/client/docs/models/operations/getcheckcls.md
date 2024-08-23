# GetCheckCLS

## Example Usage

```typescript
import { GetCheckCLS } from '@vercel/client/models/operations';

let value: GetCheckCLS = {
  value: 2103.82,
  source: 'web-vitals',
};
```

## Fields

| Field           | Type                                                                                               | Required           | Description |
| --------------- | -------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `value`         | _number_                                                                                           | :heavy_check_mark: | N/A         |
| `previousValue` | _number_                                                                                           | :heavy_minus_sign: | N/A         |
| `source`        | [operations.GetCheckChecksResponseSource](../../models/operations/getcheckchecksresponsesource.md) | :heavy_check_mark: | N/A         |
