# CreateCheckVirtualExperienceScore

## Example Usage

```typescript
import { CreateCheckVirtualExperienceScore } from '@vercel/client/models/operations';

let value: CreateCheckVirtualExperienceScore = {
  value: 7369.18,
  source: 'web-vitals',
};
```

## Fields

| Field           | Type                                                                                                                                         | Required           | Description |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `value`         | _number_                                                                                                                                     | :heavy_check_mark: | N/A         |
| `previousValue` | _number_                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `source`        | [operations.CreateCheckChecksResponse200ApplicationJSONSource](../../models/operations/createcheckchecksresponse200applicationjsonsource.md) | :heavy_check_mark: | N/A         |
