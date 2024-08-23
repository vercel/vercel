# GetDeploymentGitSourceDeployments2

## Example Usage

```typescript
import { GetDeploymentGitSourceDeployments2 } from '@vercel/client/models/operations';

let value: GetDeploymentGitSourceDeployments2 = {
  type: 'github',
  org: '<value>',
  repo: '<value>',
};
```

## Fields

| Field  | Type                                                                                           | Required           | Description |
| ------ | ---------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `type` | [operations.GetDeploymentGitSourceType](../../models/operations/getdeploymentgitsourcetype.md) | :heavy_check_mark: | N/A         |
| `org`  | _string_                                                                                       | :heavy_check_mark: | N/A         |
| `repo` | _string_                                                                                       | :heavy_check_mark: | N/A         |
| `ref`  | _string_                                                                                       | :heavy_minus_sign: | N/A         |
| `sha`  | _string_                                                                                       | :heavy_minus_sign: | N/A         |
| `prId` | _number_                                                                                       | :heavy_minus_sign: | N/A         |
