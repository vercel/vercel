# GetAllChecksFCP

## Example Usage

```typescript
import { GetAllChecksFCP } from '@vercel/client/models/operations';

let value: GetAllChecksFCP = {
  value: 6120.96,
  source: 'web-vitals',
};
```

## Fields

| Field           | Type                                                                           | Required           | Description |
| --------------- | ------------------------------------------------------------------------------ | ------------------ | ----------- |
| `value`         | _number_                                                                       | :heavy_check_mark: | N/A         |
| `previousValue` | _number_                                                                       | :heavy_minus_sign: | N/A         |
| `source`        | [operations.GetAllChecksSource](../../models/operations/getallcheckssource.md) | :heavy_check_mark: | N/A         |
