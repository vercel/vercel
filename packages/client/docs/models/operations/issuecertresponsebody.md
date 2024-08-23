# IssueCertResponseBody

## Example Usage

```typescript
import { IssueCertResponseBody } from '@vercel/client/models/operations';

let value: IssueCertResponseBody = {
  id: '<id>',
  createdAt: 9700.79,
  expiresAt: 9391.61,
  autoRenew: false,
  cns: ['<value>'],
};
```

## Fields

| Field       | Type       | Required           | Description |
| ----------- | ---------- | ------------------ | ----------- |
| `id`        | _string_   | :heavy_check_mark: | N/A         |
| `createdAt` | _number_   | :heavy_check_mark: | N/A         |
| `expiresAt` | _number_   | :heavy_check_mark: | N/A         |
| `autoRenew` | _boolean_  | :heavy_check_mark: | N/A         |
| `cns`       | _string_[] | :heavy_check_mark: | N/A         |
