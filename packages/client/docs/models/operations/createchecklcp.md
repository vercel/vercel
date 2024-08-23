# CreateCheckLCP

## Example Usage

```typescript
import { CreateCheckLCP } from '@vercel/client/models/operations';

let value: CreateCheckLCP = {
  value: 2645.55,
  source: 'web-vitals',
};
```

## Fields

| Field           | Type                                                                                     | Required           | Description |
| --------------- | ---------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `value`         | _number_                                                                                 | :heavy_check_mark: | N/A         |
| `previousValue` | _number_                                                                                 | :heavy_minus_sign: | N/A         |
| `source`        | [operations.CreateCheckChecksSource](../../models/operations/createcheckcheckssource.md) | :heavy_check_mark: | N/A         |
