# DeleteDeploymentRequest

## Example Usage

```typescript
import { DeleteDeploymentRequest } from '@vercel/client/models/operations';

let value: DeleteDeploymentRequest = {
  id: 'dpl_5WJWYSyB7BpgTj3EuwF37WMRBXBtPQ2iTMJHJBJyRfd',
  url: 'https://files-orcin-xi.vercel.app/',
};
```

## Fields

| Field    | Type     | Required           | Description                                                             | Example                                         |
| -------- | -------- | ------------------ | ----------------------------------------------------------------------- | ----------------------------------------------- |
| `id`     | _string_ | :heavy_check_mark: | The ID of the deployment to be deleted                                  | dpl_5WJWYSyB7BpgTj3EuwF37WMRBXBtPQ2iTMJHJBJyRfd |
| `url`    | _string_ | :heavy_minus_sign: | A Deployment or Alias URL. In case it is passed, the ID will be ignored | https://files-orcin-xi.vercel.app/              |
| `teamId` | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of.                |                                                 |
| `slug`   | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.                      |                                                 |
