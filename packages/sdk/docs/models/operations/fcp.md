# Fcp

## Example Usage

```typescript
import { Fcp } from "@vercel/sdk/models/operations";

let value: Fcp = {
  value: 1200,
  previousValue: 900,
  source: "web-vitals",
};
```

## Fields

| Field                                                                        | Type                                                                         | Required                                                                     | Description                                                                  | Example                                                                      |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `value`                                                                      | *number*                                                                     | :heavy_check_mark:                                                           | First Contentful Paint value                                                 | 1200                                                                         |
| `previousValue`                                                              | *number*                                                                     | :heavy_minus_sign:                                                           | Previous First Contentful Paint value to display a delta                     | 900                                                                          |
| `source`                                                                     | [operations.UpdateCheckSource](../../models/operations/updatechecksource.md) | :heavy_check_mark:                                                           | N/A                                                                          |                                                                              |