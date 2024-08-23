# GetAllChecksCLS

## Example Usage

```typescript
import { GetAllChecksCLS } from '@vercel/client/models/operations';

let value: GetAllChecksCLS = {
  value: 6169.34,
  source: 'web-vitals',
};
```

## Fields

| Field           | Type                                                                                                       | Required           | Description |
| --------------- | ---------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `value`         | _number_                                                                                                   | :heavy_check_mark: | N/A         |
| `previousValue` | _number_                                                                                                   | :heavy_minus_sign: | N/A         |
| `source`        | [operations.GetAllChecksChecksResponseSource](../../models/operations/getallcheckschecksresponsesource.md) | :heavy_check_mark: | N/A         |
