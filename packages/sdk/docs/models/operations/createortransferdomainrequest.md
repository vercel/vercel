# CreateOrTransferDomainRequest

## Example Usage

```typescript
import { CreateOrTransferDomainRequest } from "@vercel/sdk/models/operations";

let value: CreateOrTransferDomainRequest = {
  requestBody: {
    name: "example.com",
    cdnEnabled: true,
    method: "transfer-in",
  },
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `teamId`                                                 | *string*                                                 | :heavy_minus_sign:                                       | The Team identifier to perform the request on behalf of. |
| `slug`                                                   | *string*                                                 | :heavy_minus_sign:                                       | The Team slug to perform the request on behalf of.       |
| `requestBody`                                            | *operations.CreateOrTransferDomainRequestBody*           | :heavy_minus_sign:                                       | N/A                                                      |