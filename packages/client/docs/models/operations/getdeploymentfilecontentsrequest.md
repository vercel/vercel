# GetDeploymentFileContentsRequest

## Example Usage

```typescript
import { GetDeploymentFileContentsRequest } from '@vercel/client/models/operations';

let value: GetDeploymentFileContentsRequest = {
  id: '<id>',
  fileId: '<value>',
};
```

## Fields

| Field    | Type     | Required           | Description                                              |
| -------- | -------- | ------------------ | -------------------------------------------------------- |
| `id`     | _string_ | :heavy_check_mark: | The unique deployment identifier                         |
| `fileId` | _string_ | :heavy_check_mark: | The unique file identifier                               |
| `path`   | _string_ | :heavy_minus_sign: | Path to the file to fetch (only for Git deployments)     |
| `teamId` | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`   | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
