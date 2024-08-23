# Four

## Example Usage

```typescript
import { Four } from '@vercel/client/models/operations';

let value: Four = {
  ref: '<value>',
  repoUuid: '<value>',
  type: 'bitbucket',
};
```

## Fields

| Field           | Type                                                                                                                       | Required           | Description |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `ref`           | _string_                                                                                                                   | :heavy_check_mark: | N/A         |
| `repoUuid`      | _string_                                                                                                                   | :heavy_check_mark: | N/A         |
| `sha`           | _string_                                                                                                                   | :heavy_minus_sign: | N/A         |
| `type`          | [operations.CreateDeploymentGitSourceDeploymentsType](../../models/operations/createdeploymentgitsourcedeploymentstype.md) | :heavy_check_mark: | N/A         |
| `workspaceUuid` | _string_                                                                                                                   | :heavy_minus_sign: | N/A         |
