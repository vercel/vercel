# CreateCheckVirtualExperienceScore

## Example Usage

```typescript
import { CreateCheckVirtualExperienceScore } from "@vercel/sdk/models/operations";

let value: CreateCheckVirtualExperienceScore = {
  value: 7742.34,
  source: "web-vitals",
};
```

## Fields

| Field                                                                                                                                        | Type                                                                                                                                         | Required                                                                                                                                     | Description                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`                                                                                                                                      | *number*                                                                                                                                     | :heavy_check_mark:                                                                                                                           | N/A                                                                                                                                          |
| `previousValue`                                                                                                                              | *number*                                                                                                                                     | :heavy_minus_sign:                                                                                                                           | N/A                                                                                                                                          |
| `source`                                                                                                                                     | [operations.CreateCheckChecksResponse200ApplicationJSONSource](../../models/operations/createcheckchecksresponse200applicationjsonsource.md) | :heavy_check_mark:                                                                                                                           | N/A                                                                                                                                          |