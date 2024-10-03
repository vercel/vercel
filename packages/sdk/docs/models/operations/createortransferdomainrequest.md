# CreateOrTransferDomainRequest

## Example Usage

```typescript
import { CreateOrTransferDomainRequest } from "@vercel/sdk/models/operations/createortransferdomain.js";

let value: CreateOrTransferDomainRequest = {
  requestBody: {
    name: "example.com",
    method: "transfer-in",
    authCode: "fdhfr820ad#@FAdlj$$",
    expectedPrice: 8,
  },
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `teamId`                                                 | *string*                                                 | :heavy_minus_sign:                                       | The Team identifier to perform the request on behalf of. |
| `slug`                                                   | *string*                                                 | :heavy_minus_sign:                                       | The Team slug to perform the request on behalf of.       |
| `requestBody`                                            | *operations.CreateOrTransferDomainRequestBody*           | :heavy_minus_sign:                                       | N/A                                                      |