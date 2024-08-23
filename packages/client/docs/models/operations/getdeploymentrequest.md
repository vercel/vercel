# GetDeploymentRequest

## Example Usage

```typescript
import { GetDeploymentRequest } from '@vercel/client/models/operations';

let value: GetDeploymentRequest = {
  idOrUrl: 'dpl_89qyp1cskzkLrVicDaZoDbjyHuDJ',
  withGitRepoInfo: 'true',
};
```

## Fields

| Field             | Type     | Required           | Description                                              | Example                          |
| ----------------- | -------- | ------------------ | -------------------------------------------------------- | -------------------------------- |
| `idOrUrl`         | _string_ | :heavy_check_mark: | The unique identifier or hostname of the deployment.     | dpl_89qyp1cskzkLrVicDaZoDbjyHuDJ |
| `withGitRepoInfo` | _string_ | :heavy_minus_sign: | Whether to add in gitRepo information.                   | true                             |
| `teamId`          | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |                                  |
| `slug`            | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |                                  |
