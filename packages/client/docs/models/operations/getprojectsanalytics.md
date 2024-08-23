# GetProjectsAnalytics

## Example Usage

```typescript
import { GetProjectsAnalytics } from '@vercel/client/models/operations';

let value: GetProjectsAnalytics = {
  id: '<id>',
  disabledAt: 4692.49,
  enabledAt: 9988.48,
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
