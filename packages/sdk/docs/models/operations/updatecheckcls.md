# UpdateCheckCLS

## Example Usage

```typescript
import { UpdateCheckCLS } from "@vercel/sdk/models/operations";

let value: UpdateCheckCLS = {
  value: 6527.9,
  source: "web-vitals",
};
```

## Fields

| Field                                                                                                                                        | Type                                                                                                                                         | Required                                                                                                                                     | Description                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`                                                                                                                                      | *number*                                                                                                                                     | :heavy_check_mark:                                                                                                                           | N/A                                                                                                                                          |
| `previousValue`                                                                                                                              | *number*                                                                                                                                     | :heavy_minus_sign:                                                                                                                           | N/A                                                                                                                                          |
| `source`                                                                                                                                     | [operations.UpdateCheckChecksResponse200ApplicationJSONSource](../../models/operations/updatecheckchecksresponse200applicationjsonsource.md) | :heavy_check_mark:                                                                                                                           | N/A                                                                                                                                          |