# CreateProjectAnalytics

## Example Usage

```typescript
import { CreateProjectAnalytics } from '@vercel/client/models/operations';

let value: CreateProjectAnalytics = {
  id: '<id>',
  disabledAt: 6748.48,
  enabledAt: 5173.79,
};
```

## Fields

| Field                 | Type     | Required           | Description |
| --------------------- | -------- | ------------------ | ----------- |
| `id`                  | _string_ | :heavy_check_mark: | N/A         |
| `canceledAt`          | _number_ | :heavy_minus_sign: | N/A         |
| `disabledAt`          | _number_ | :heavy_check_mark: | N/A         |
| `enabledAt`           | _number_ | :heavy_check_mark: | N/A         |
| `paidAt`              | _number_ | :heavy_minus_sign: | N/A         |
| `sampleRatePercent`   | _number_ | :heavy_minus_sign: | N/A         |
| `spendLimitInDollars` | _number_ | :heavy_minus_sign: | N/A         |
