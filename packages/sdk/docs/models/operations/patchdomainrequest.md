# PatchDomainRequest

## Example Usage

```typescript
import { PatchDomainRequest } from "@vercel/sdk/models/operations";

let value: PatchDomainRequest = {
  domain: "only-tussle.net",
  requestBody: {
    op: "move-out",
  },
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `domain`                                                 | *string*                                                 | :heavy_check_mark:                                       | N/A                                                      |
| `teamId`                                                 | *string*                                                 | :heavy_minus_sign:                                       | The Team identifier to perform the request on behalf of. |
| `slug`                                                   | *string*                                                 | :heavy_minus_sign:                                       | The Team slug to perform the request on behalf of.       |
| `requestBody`                                            | *operations.PatchDomainRequestBody*                      | :heavy_minus_sign:                                       | N/A                                                      |