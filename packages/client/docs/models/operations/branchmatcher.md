# BranchMatcher

## Example Usage

```typescript
import { BranchMatcher } from '@vercel/client/models/operations';

let value: BranchMatcher = {
  type: 'equals',
  pattern: '<value>',
};
```

## Fields

| Field     | Type                                                                                                                 | Required           | Description |
| --------- | -------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `type`    | [operations.CreateDeploymentCustomEnvironmentType](../../models/operations/createdeploymentcustomenvironmenttype.md) | :heavy_check_mark: | N/A         |
| `pattern` | _string_                                                                                                             | :heavy_check_mark: | N/A         |
