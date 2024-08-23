# UploadCertRequest

## Example Usage

```typescript
import { UploadCertRequest } from '@vercel/client/models/operations';

let value: UploadCertRequest = {};
```

## Fields

| Field         | Type                                                                                 | Required           | Description                                              |
| ------------- | ------------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------- |
| `teamId`      | _string_                                                                             | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`        | _string_                                                                             | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
| `requestBody` | [operations.UploadCertRequestBody](../../models/operations/uploadcertrequestbody.md) | :heavy_minus_sign: | N/A                                                      |
