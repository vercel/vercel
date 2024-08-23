# CreateOrTransferDomainRequest

## Example Usage

```typescript
import { CreateOrTransferDomainRequest } from '@vercel/client/models/operations';

let value: CreateOrTransferDomainRequest = {
  requestBody: {
    name: 'example.com',
    cdnEnabled: true,
    method: 'transfer-in',
  },
};
```

## Fields

| Field         | Type                                           | Required           | Description                                              |
| ------------- | ---------------------------------------------- | ------------------ | -------------------------------------------------------- |
| `teamId`      | _string_                                       | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`        | _string_                                       | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
| `requestBody` | _operations.CreateOrTransferDomainRequestBody_ | :heavy_minus_sign: | N/A                                                      |
