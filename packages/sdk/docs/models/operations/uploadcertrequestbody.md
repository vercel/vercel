# UploadCertRequestBody

## Example Usage

```typescript
import { UploadCertRequestBody } from "@vercel/sdk/models/operations";

let value: UploadCertRequestBody = {
  ca: "<value>",
  key: "<key>",
  cert: "<value>",
};
```

## Fields

| Field                              | Type                               | Required                           | Description                        |
| ---------------------------------- | ---------------------------------- | ---------------------------------- | ---------------------------------- |
| `ca`                               | *string*                           | :heavy_check_mark:                 | The certificate authority          |
| `key`                              | *string*                           | :heavy_check_mark:                 | The certificate key                |
| `cert`                             | *string*                           | :heavy_check_mark:                 | The certificate                    |
| `skipValidation`                   | *boolean*                          | :heavy_minus_sign:                 | Skip validation of the certificate |