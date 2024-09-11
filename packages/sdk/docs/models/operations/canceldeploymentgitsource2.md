# CancelDeploymentGitSource2

## Example Usage

```typescript
import { CancelDeploymentGitSource2 } from "@vercel/sdk/models/operations";

let value: CancelDeploymentGitSource2 = {
  type: "github",
  org: "<value>",
  repo: "<value>",
};
```

## Fields

| Field                                                                                                                      | Type                                                                                                                       | Required                                                                                                                   | Description                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `type`                                                                                                                     | [operations.CancelDeploymentGitSourceDeploymentsType](../../models/operations/canceldeploymentgitsourcedeploymentstype.md) | :heavy_check_mark:                                                                                                         | N/A                                                                                                                        |
| `org`                                                                                                                      | *string*                                                                                                                   | :heavy_check_mark:                                                                                                         | N/A                                                                                                                        |
| `repo`                                                                                                                     | *string*                                                                                                                   | :heavy_check_mark:                                                                                                         | N/A                                                                                                                        |
| `ref`                                                                                                                      | *string*                                                                                                                   | :heavy_minus_sign:                                                                                                         | N/A                                                                                                                        |
| `sha`                                                                                                                      | *string*                                                                                                                   | :heavy_minus_sign:                                                                                                         | N/A                                                                                                                        |
| `prId`                                                                                                                     | *number*                                                                                                                   | :heavy_minus_sign:                                                                                                         | N/A                                                                                                                        |