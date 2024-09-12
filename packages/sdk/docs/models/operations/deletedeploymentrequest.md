# DeleteDeploymentRequest

## Example Usage

```typescript
import { DeleteDeploymentRequest } from "@vercel/sdk/models/operations";

let value: DeleteDeploymentRequest = {
  id: "dpl_5WJWYSyB7BpgTj3EuwF37WMRBXBtPQ2iTMJHJBJyRfd",
  url: "https://files-orcin-xi.vercel.app/",
};
```

## Fields

| Field                                                                   | Type                                                                    | Required                                                                | Description                                                             | Example                                                                 |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `id`                                                                    | *string*                                                                | :heavy_check_mark:                                                      | The ID of the deployment to be deleted                                  | dpl_5WJWYSyB7BpgTj3EuwF37WMRBXBtPQ2iTMJHJBJyRfd                         |
| `url`                                                                   | *string*                                                                | :heavy_minus_sign:                                                      | A Deployment or Alias URL. In case it is passed, the ID will be ignored | https://files-orcin-xi.vercel.app/                                      |
| `teamId`                                                                | *string*                                                                | :heavy_minus_sign:                                                      | The Team identifier to perform the request on behalf of.                |                                                                         |
| `slug`                                                                  | *string*                                                                | :heavy_minus_sign:                                                      | The Team slug to perform the request on behalf of.                      |                                                                         |