# GitSource1

## Example Usage

```typescript
import { GitSource1 } from '@vercel/client/models/operations';

let value: GitSource1 = {
  type: 'github',
  repoId: '<value>',
};
```

## Fields

| Field    | Type                                                                                                                                       | Required           | Description |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `type`   | [operations.CreateDeploymentGitSourceDeploymentsResponseType](../../models/operations/createdeploymentgitsourcedeploymentsresponsetype.md) | :heavy_check_mark: | N/A         |
| `repoId` | _operations.GitSourceRepoId_                                                                                                               | :heavy_check_mark: | N/A         |
| `ref`    | _string_                                                                                                                                   | :heavy_minus_sign: | N/A         |
| `sha`    | _string_                                                                                                                                   | :heavy_minus_sign: | N/A         |
| `prId`   | _number_                                                                                                                                   | :heavy_minus_sign: | N/A         |
