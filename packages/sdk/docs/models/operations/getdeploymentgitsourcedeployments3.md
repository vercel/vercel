# GetDeploymentGitSourceDeployments3

## Example Usage

```typescript
import { GetDeploymentGitSourceDeployments3 } from "@vercel/sdk/models/operations";

let value: GetDeploymentGitSourceDeployments3 = {
  type: "gitlab",
  projectId: "<value>",
};
```

## Fields

| Field                                                                                                                | Type                                                                                                                 | Required                                                                                                             | Description                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `type`                                                                                                               | [operations.GetDeploymentGitSourceDeploymentsType](../../models/operations/getdeploymentgitsourcedeploymentstype.md) | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |
| `projectId`                                                                                                          | *operations.GetDeploymentGitSourceProjectId*                                                                         | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |
| `ref`                                                                                                                | *string*                                                                                                             | :heavy_minus_sign:                                                                                                   | N/A                                                                                                                  |
| `sha`                                                                                                                | *string*                                                                                                             | :heavy_minus_sign:                                                                                                   | N/A                                                                                                                  |
| `prId`                                                                                                               | *number*                                                                                                             | :heavy_minus_sign:                                                                                                   | N/A                                                                                                                  |