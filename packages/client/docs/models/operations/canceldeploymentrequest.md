# CancelDeploymentRequest

## Example Usage

```typescript
import { CancelDeploymentRequest } from '@vercel/client/models/operations';

let value: CancelDeploymentRequest = {
  id: 'dpl_5WJWYSyB7BpgTj3EuwF37WMRBXBtPQ2iTMJHJBJyRfd',
};
```

## Fields

| Field    | Type     | Required           | Description                                              | Example                                         |
| -------- | -------- | ------------------ | -------------------------------------------------------- | ----------------------------------------------- |
| `id`     | _string_ | :heavy_check_mark: | The unique identifier of the deployment.                 | dpl_5WJWYSyB7BpgTj3EuwF37WMRBXBtPQ2iTMJHJBJyRfd |
| `teamId` | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |                                                 |
| `slug`   | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |                                                 |
