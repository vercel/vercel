# UpdateCheckVirtualExperienceScore

## Example Usage

```typescript
import { UpdateCheckVirtualExperienceScore } from '@vercel/client/models/operations';

let value: UpdateCheckVirtualExperienceScore = {
  value: 1613.09,
  source: 'web-vitals',
};
```

## Fields

| Field           | Type                                                                                                                                                                             | Required           | Description |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `value`         | _number_                                                                                                                                                                         | :heavy_check_mark: | N/A         |
| `previousValue` | _number_                                                                                                                                                                         | :heavy_minus_sign: | N/A         |
| `source`        | [operations.UpdateCheckChecksResponse200ApplicationJSONResponseBodyOutputSource](../../models/operations/updatecheckchecksresponse200applicationjsonresponsebodyoutputsource.md) | :heavy_check_mark: | N/A         |
