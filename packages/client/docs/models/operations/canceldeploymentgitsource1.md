# CancelDeploymentGitSource1

## Example Usage

```typescript
import { CancelDeploymentGitSource1 } from '@vercel/client/models/operations';

let value: CancelDeploymentGitSource1 = {
  type: 'github',
  repoId: 5230.06,
};
```

## Fields

| Field    | Type                                                                                                 | Required           | Description |
| -------- | ---------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `type`   | [operations.CancelDeploymentGitSourceType](../../models/operations/canceldeploymentgitsourcetype.md) | :heavy_check_mark: | N/A         |
| `repoId` | _operations.CancelDeploymentGitSourceRepoId_                                                         | :heavy_check_mark: | N/A         |
| `ref`    | _string_                                                                                             | :heavy_minus_sign: | N/A         |
| `sha`    | _string_                                                                                             | :heavy_minus_sign: | N/A         |
| `prId`   | _number_                                                                                             | :heavy_minus_sign: | N/A         |
