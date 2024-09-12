# GetCheckRequest

## Example Usage

```typescript
import { GetCheckRequest } from "@vercel/sdk/models/operations";

let value: GetCheckRequest = {
  deploymentId: "dpl_2qn7PZrx89yxY34vEZPD31Y9XVj6",
  checkId: "check_2qn7PZrx89yxY34vEZPD31Y9XVj6",
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              | Example                                                  |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `deploymentId`                                           | *string*                                                 | :heavy_check_mark:                                       | The deployment to get the check for.                     | dpl_2qn7PZrx89yxY34vEZPD31Y9XVj6                         |
| `checkId`                                                | *string*                                                 | :heavy_check_mark:                                       | The check to fetch                                       | check_2qn7PZrx89yxY34vEZPD31Y9XVj6                       |
| `teamId`                                                 | *string*                                                 | :heavy_minus_sign:                                       | The Team identifier to perform the request on behalf of. |                                                          |
| `slug`                                                   | *string*                                                 | :heavy_minus_sign:                                       | The Team slug to perform the request on behalf of.       |                                                          |