# GitSource1

## Example Usage

```typescript
import { GitSource1 } from "@vercel/sdk/models/operations";

let value: GitSource1 = {
  type: "github",
  repoId: "<value>",
};
```

## Fields

| Field                                                                                                                                      | Type                                                                                                                                       | Required                                                                                                                                   | Description                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`                                                                                                                                     | [operations.CreateDeploymentGitSourceDeploymentsResponseType](../../models/operations/createdeploymentgitsourcedeploymentsresponsetype.md) | :heavy_check_mark:                                                                                                                         | N/A                                                                                                                                        |
| `repoId`                                                                                                                                   | *operations.GitSourceRepoId*                                                                                                               | :heavy_check_mark:                                                                                                                         | N/A                                                                                                                                        |
| `ref`                                                                                                                                      | *string*                                                                                                                                   | :heavy_minus_sign:                                                                                                                         | N/A                                                                                                                                        |
| `sha`                                                                                                                                      | *string*                                                                                                                                   | :heavy_minus_sign:                                                                                                                         | N/A                                                                                                                                        |
| `prId`                                                                                                                                     | *number*                                                                                                                                   | :heavy_minus_sign:                                                                                                                         | N/A                                                                                                                                        |