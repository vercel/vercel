# AnalyticsUsage

## Example Usage

```typescript
import { AnalyticsUsage } from "@vercel/sdk/models/operations/createteam.js";

let value: AnalyticsUsage = {
  price: 1594.69,
  batch: 4170.30,
  threshold: 4268.20,
  hidden: false,
};
```

## Fields

| Field                                                  | Type                                                   | Required                                               | Description                                            |
| ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| `matrix`                                               | [operations.Matrix](../../models/operations/matrix.md) | :heavy_minus_sign:                                     | N/A                                                    |
| `tier`                                                 | *number*                                               | :heavy_minus_sign:                                     | N/A                                                    |
| `price`                                                | *number*                                               | :heavy_check_mark:                                     | N/A                                                    |
| `batch`                                                | *number*                                               | :heavy_check_mark:                                     | N/A                                                    |
| `threshold`                                            | *number*                                               | :heavy_check_mark:                                     | N/A                                                    |
| `name`                                                 | *string*                                               | :heavy_minus_sign:                                     | N/A                                                    |
| `hidden`                                               | *boolean*                                              | :heavy_check_mark:                                     | N/A                                                    |
| `disabledAt`                                           | *number*                                               | :heavy_minus_sign:                                     | N/A                                                    |
| `enabledAt`                                            | *number*                                               | :heavy_minus_sign:                                     | N/A                                                    |