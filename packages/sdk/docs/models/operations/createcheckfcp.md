# CreateCheckFCP

## Example Usage

```typescript
import { CreateCheckFCP } from "@vercel/sdk/models/operations";

let value: CreateCheckFCP = {
  value: 4146.62,
  source: "web-vitals",
};
```

## Fields

| Field                                                                        | Type                                                                         | Required                                                                     | Description                                                                  |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `value`                                                                      | *number*                                                                     | :heavy_check_mark:                                                           | N/A                                                                          |
| `previousValue`                                                              | *number*                                                                     | :heavy_minus_sign:                                                           | N/A                                                                          |
| `source`                                                                     | [operations.CreateCheckSource](../../models/operations/createchecksource.md) | :heavy_check_mark:                                                           | N/A                                                                          |