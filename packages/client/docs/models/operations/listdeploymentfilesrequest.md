# ListDeploymentFilesRequest

## Example Usage

```typescript
import { ListDeploymentFilesRequest } from '@vercel/client/models/operations';

let value: ListDeploymentFilesRequest = {
  id: '<id>',
};
```

## Fields

| Field    | Type     | Required           | Description                                              |
| -------- | -------- | ------------------ | -------------------------------------------------------- |
| `id`     | _string_ | :heavy_check_mark: | The unique deployment identifier                         |
| `teamId` | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`   | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
