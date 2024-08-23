# UpdateCheckTBT

## Example Usage

```typescript
import { UpdateCheckTBT } from '@vercel/client/models/operations';

let value: UpdateCheckTBT = {
  value: 6350.59,
  source: 'web-vitals',
};
```

## Fields

| Field           | Type                                                                                                                                                                 | Required           | Description |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `value`         | _number_                                                                                                                                                             | :heavy_check_mark: | N/A         |
| `previousValue` | _number_                                                                                                                                                             | :heavy_minus_sign: | N/A         |
| `source`        | [operations.UpdateCheckChecksResponse200ApplicationJSONResponseBodySource](../../models/operations/updatecheckchecksresponse200applicationjsonresponsebodysource.md) | :heavy_check_mark: | N/A         |
