# Three

## Example Usage

```typescript
import { Three } from '@vercel/client/models/operations';

let value: Three = {
  projectId: 9061.72,
  ref: '<value>',
  type: 'gitlab',
};
```

## Fields

| Field       | Type                                                                                                 | Required           | Description |
| ----------- | ---------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `projectId` | _operations.ProjectId_                                                                               | :heavy_check_mark: | N/A         |
| `ref`       | _string_                                                                                             | :heavy_check_mark: | N/A         |
| `sha`       | _string_                                                                                             | :heavy_minus_sign: | N/A         |
| `type`      | [operations.CreateDeploymentGitSourceType](../../models/operations/createdeploymentgitsourcetype.md) | :heavy_check_mark: | N/A         |
