# GetDeploymentFileContentsRequest

## Example Usage

```typescript
import { GetDeploymentFileContentsRequest } from "@vercel/sdk/models/operations";

let value: GetDeploymentFileContentsRequest = {
  id: "<id>",
  fileId: "<value>",
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `id`                                                     | *string*                                                 | :heavy_check_mark:                                       | The unique deployment identifier                         |
| `fileId`                                                 | *string*                                                 | :heavy_check_mark:                                       | The unique file identifier                               |
| `path`                                                   | *string*                                                 | :heavy_minus_sign:                                       | Path to the file to fetch (only for Git deployments)     |
| `teamId`                                                 | *string*                                                 | :heavy_minus_sign:                                       | The Team identifier to perform the request on behalf of. |
| `slug`                                                   | *string*                                                 | :heavy_minus_sign:                                       | The Team slug to perform the request on behalf of.       |