# CustomEnvironmentBranchMatcher

## Example Usage

```typescript
import { CustomEnvironmentBranchMatcher } from "@vercel/sdk/models/operations/canceldeployment.js";

let value: CustomEnvironmentBranchMatcher = {
  type: "endsWith",
  pattern: "<value>",
};
```

## Fields

| Field                                                                                                                                      | Type                                                                                                                                       | Required                                                                                                                                   | Description                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`                                                                                                                                     | [operations.CancelDeploymentCustomEnvironmentDeploymentsType](../../models/operations/canceldeploymentcustomenvironmentdeploymentstype.md) | :heavy_check_mark:                                                                                                                         | N/A                                                                                                                                        |
| `pattern`                                                                                                                                  | *string*                                                                                                                                   | :heavy_check_mark:                                                                                                                         | N/A                                                                                                                                        |