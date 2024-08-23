# UploadCertResponseBody

## Example Usage

```typescript
import { UploadCertResponseBody } from '@vercel/client/models/operations';

let value: UploadCertResponseBody = {
  id: '<id>',
  createdAt: 4441.21,
  expiresAt: 5063.12,
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
