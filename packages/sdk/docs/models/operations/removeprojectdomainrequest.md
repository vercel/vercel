# RemoveProjectDomainRequest

## Example Usage

```typescript
import { RemoveProjectDomainRequest } from "@vercel/sdk/models/operations";

let value: RemoveProjectDomainRequest = {
  idOrName: "<value>",
  domain: "www.example.com",
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              | Example                                                  |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `idOrName`                                               | *string*                                                 | :heavy_check_mark:                                       | The unique project identifier or the project name        |                                                          |
| `domain`                                                 | *string*                                                 | :heavy_check_mark:                                       | The project domain name                                  | www.example.com                                          |
| `teamId`                                                 | *string*                                                 | :heavy_minus_sign:                                       | The Team identifier to perform the request on behalf of. |                                                          |
| `slug`                                                   | *string*                                                 | :heavy_minus_sign:                                       | The Team slug to perform the request on behalf of.       |                                                          |