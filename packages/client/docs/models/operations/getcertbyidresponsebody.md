# GetCertByIdResponseBody

## Example Usage

```typescript
import { GetCertByIdResponseBody } from '@vercel/client/models/operations';

let value: GetCertByIdResponseBody = {
  id: '<id>',
  createdAt: 3340.18,
  expiresAt: 1764.99,
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
