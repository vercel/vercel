# GetAllChecksTBT

## Example Usage

```typescript
import { GetAllChecksTBT } from '@vercel/client/models/operations';

let value: GetAllChecksTBT = {
  value: 3864.89,
  source: 'web-vitals',
};
```

## Fields

| Field           | Type                                                                                                             | Required           | Description |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `value`         | _number_                                                                                                         | :heavy_check_mark: | N/A         |
| `previousValue` | _number_                                                                                                         | :heavy_minus_sign: | N/A         |
| `source`        | [operations.GetAllChecksChecksResponse200Source](../../models/operations/getallcheckschecksresponse200source.md) | :heavy_check_mark: | N/A         |
