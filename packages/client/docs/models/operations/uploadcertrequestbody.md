# UploadCertRequestBody

## Example Usage

```typescript
import { UploadCertRequestBody } from '@vercel/client/models/operations';

let value: UploadCertRequestBody = {
  ca: '<value>',
  key: '<key>',
  cert: '<value>',
};
```

## Fields

| Field            | Type      | Required           | Description                        |
| ---------------- | --------- | ------------------ | ---------------------------------- |
| `ca`             | _string_  | :heavy_check_mark: | The certificate authority          |
| `key`            | _string_  | :heavy_check_mark: | The certificate key                |
| `cert`           | _string_  | :heavy_check_mark: | The certificate                    |
| `skipValidation` | _boolean_ | :heavy_minus_sign: | Skip validation of the certificate |
