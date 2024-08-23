# UpdateCheckCLS

## Example Usage

```typescript
import { UpdateCheckCLS } from '@vercel/client/models/operations';

let value: UpdateCheckCLS = {
  value: 2088.76,
  source: 'web-vitals',
};
```

## Fields

| Field           | Type                                                                                                                                         | Required           | Description |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `value`         | _number_                                                                                                                                     | :heavy_check_mark: | N/A         |
| `previousValue` | _number_                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `source`        | [operations.UpdateCheckChecksResponse200ApplicationJSONSource](../../models/operations/updatecheckchecksresponse200applicationjsonsource.md) | :heavy_check_mark: | N/A         |
