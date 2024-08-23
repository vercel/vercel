# UpdateProjectAnalytics

## Example Usage

```typescript
import { UpdateProjectAnalytics } from '@vercel/client/models/operations';

let value: UpdateProjectAnalytics = {
  id: '<id>',
  disabledAt: 3738.13,
  enabledAt: 698.59,
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
