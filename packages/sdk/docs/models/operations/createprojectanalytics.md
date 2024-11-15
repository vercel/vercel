# CreateProjectAnalytics

## Example Usage

```typescript
import { CreateProjectAnalytics } from "@vercel/sdk/models/operations/createproject.js";

let value: CreateProjectAnalytics = {
  id: "<id>",
  disabledAt: 764.87,
  enabledAt: 6964.63,
};
```

## Fields

| Field                 | Type                  | Required              | Description           |
| --------------------- | --------------------- | --------------------- | --------------------- |
| `id`                  | *string*              | :heavy_check_mark:    | N/A                   |
| `canceledAt`          | *number*              | :heavy_minus_sign:    | N/A                   |
| `disabledAt`          | *number*              | :heavy_check_mark:    | N/A                   |
| `enabledAt`           | *number*              | :heavy_check_mark:    | N/A                   |
| `paidAt`              | *number*              | :heavy_minus_sign:    | N/A                   |
| `sampleRatePercent`   | *number*              | :heavy_minus_sign:    | N/A                   |
| `spendLimitInDollars` | *number*              | :heavy_minus_sign:    | N/A                   |