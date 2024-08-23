# GetCheckLCP

## Example Usage

```typescript
import { GetCheckLCP } from '@vercel/client/models/operations';

let value: GetCheckLCP = {
  value: 1709.09,
  source: 'web-vitals',
};
```

## Fields

| Field           | Type                                                                               | Required           | Description |
| --------------- | ---------------------------------------------------------------------------------- | ------------------ | ----------- |
| `value`         | _number_                                                                           | :heavy_check_mark: | N/A         |
| `previousValue` | _number_                                                                           | :heavy_minus_sign: | N/A         |
| `source`        | [operations.GetCheckChecksSource](../../models/operations/getcheckcheckssource.md) | :heavy_check_mark: | N/A         |
