# CreateCheckFCP

## Example Usage

```typescript
import { CreateCheckFCP } from "@vercel/sdk/models/operations/createcheck.js";

let value: CreateCheckFCP = {
  value: 3687.25,
  source: "web-vitals",
};
```

## Fields

| Field                                                                        | Type                                                                         | Required                                                                     | Description                                                                  |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `value`                                                                      | *number*                                                                     | :heavy_check_mark:                                                           | N/A                                                                          |
| `previousValue`                                                              | *number*                                                                     | :heavy_minus_sign:                                                           | N/A                                                                          |
| `source`                                                                     | [operations.CreateCheckSource](../../models/operations/createchecksource.md) | :heavy_check_mark:                                                           | N/A                                                                          |