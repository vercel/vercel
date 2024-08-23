# IssueCertRequest

## Example Usage

```typescript
import { IssueCertRequest } from '@vercel/client/models/operations';

let value: IssueCertRequest = {};
```

## Fields

| Field         | Type                                                                               | Required           | Description                                              |
| ------------- | ---------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------- |
| `teamId`      | _string_                                                                           | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`        | _string_                                                                           | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
| `requestBody` | [operations.IssueCertRequestBody](../../models/operations/issuecertrequestbody.md) | :heavy_minus_sign: | N/A                                                      |
