# GetDomainTransferRequest

## Example Usage

```typescript
import { GetDomainTransferRequest } from "@vercel/sdk/models/operations";

let value: GetDomainTransferRequest = {
  domain: "example.com",
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              | Example                                                  |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `teamId`                                                 | *string*                                                 | :heavy_minus_sign:                                       | The Team identifier to perform the request on behalf of. |                                                          |
| `slug`                                                   | *string*                                                 | :heavy_minus_sign:                                       | The Team slug to perform the request on behalf of.       |                                                          |
| `domain`                                                 | *string*                                                 | :heavy_check_mark:                                       | N/A                                                      | example.com                                              |