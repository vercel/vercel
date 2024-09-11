# CreateCheckRequest

## Example Usage

```typescript
import { CreateCheckRequest } from "@vercel/sdk/models/operations";

let value: CreateCheckRequest = {
  deploymentId: "dpl_2qn7PZrx89yxY34vEZPD31Y9XVj6",
  requestBody: {
    name: "Performance Check",
    path: "/",
    blocking: true,
    detailsUrl: "http://example.com",
    externalId: "1234abc",
    rerequestable: true,
  },
};
```

## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            | Example                                                                                |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `deploymentId`                                                                         | *string*                                                                               | :heavy_check_mark:                                                                     | The deployment to create the check for.                                                | dpl_2qn7PZrx89yxY34vEZPD31Y9XVj6                                                       |
| `teamId`                                                                               | *string*                                                                               | :heavy_minus_sign:                                                                     | The Team identifier to perform the request on behalf of.                               |                                                                                        |
| `slug`                                                                                 | *string*                                                                               | :heavy_minus_sign:                                                                     | The Team slug to perform the request on behalf of.                                     |                                                                                        |
| `requestBody`                                                                          | [operations.CreateCheckRequestBody](../../models/operations/createcheckrequestbody.md) | :heavy_minus_sign:                                                                     | N/A                                                                                    |                                                                                        |