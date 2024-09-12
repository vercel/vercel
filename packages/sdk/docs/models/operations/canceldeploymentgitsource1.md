# CancelDeploymentGitSource1

## Example Usage

```typescript
import { CancelDeploymentGitSource1 } from "@vercel/sdk/models/operations";

let value: CancelDeploymentGitSource1 = {
  type: "github",
  repoId: 5230.06,
};
```

## Fields

| Field                                                                                                | Type                                                                                                 | Required                                                                                             | Description                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `type`                                                                                               | [operations.CancelDeploymentGitSourceType](../../models/operations/canceldeploymentgitsourcetype.md) | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `repoId`                                                                                             | *operations.CancelDeploymentGitSourceRepoId*                                                         | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `ref`                                                                                                | *string*                                                                                             | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |
| `sha`                                                                                                | *string*                                                                                             | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |
| `prId`                                                                                               | *number*                                                                                             | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |