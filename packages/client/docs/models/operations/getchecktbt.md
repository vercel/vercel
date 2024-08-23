# GetCheckTBT

## Example Usage

```typescript
import { GetCheckTBT } from '@vercel/client/models/operations';

let value: GetCheckTBT = {
  value: 3581.52,
  source: 'web-vitals',
};
```

## Fields

| Field           | Type                                                                                                     | Required           | Description |
| --------------- | -------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `value`         | _number_                                                                                                 | :heavy_check_mark: | N/A         |
| `previousValue` | _number_                                                                                                 | :heavy_minus_sign: | N/A         |
| `source`        | [operations.GetCheckChecksResponse200Source](../../models/operations/getcheckchecksresponse200source.md) | :heavy_check_mark: | N/A         |
