# GetCheckVirtualExperienceScore

## Example Usage

```typescript
import { GetCheckVirtualExperienceScore } from '@vercel/client/models/operations';

let value: GetCheckVirtualExperienceScore = {
  value: 1289.26,
  source: 'web-vitals',
};
```

## Fields

| Field           | Type                                                                                                                                   | Required           | Description |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `value`         | _number_                                                                                                                               | :heavy_check_mark: | N/A         |
| `previousValue` | _number_                                                                                                                               | :heavy_minus_sign: | N/A         |
| `source`        | [operations.GetCheckChecksResponse200ApplicationJSONSource](../../models/operations/getcheckchecksresponse200applicationjsonsource.md) | :heavy_check_mark: | N/A         |
