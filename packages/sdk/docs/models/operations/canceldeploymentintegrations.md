# CancelDeploymentIntegrations

## Example Usage

```typescript
import { CancelDeploymentIntegrations } from "@vercel/sdk/models/operations/canceldeployment.js";

let value: CancelDeploymentIntegrations = {
  status: "pending",
  startedAt: 7562.87,
};
```

## Fields

| Field                                                                                                        | Type                                                                                                         | Required                                                                                                     | Description                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `status`                                                                                                     | [operations.CancelDeploymentDeploymentsStatus](../../models/operations/canceldeploymentdeploymentsstatus.md) | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `startedAt`                                                                                                  | *number*                                                                                                     | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `completedAt`                                                                                                | *number*                                                                                                     | :heavy_minus_sign:                                                                                           | N/A                                                                                                          |
| `skippedAt`                                                                                                  | *number*                                                                                                     | :heavy_minus_sign:                                                                                           | N/A                                                                                                          |
| `skippedBy`                                                                                                  | *string*                                                                                                     | :heavy_minus_sign:                                                                                           | N/A                                                                                                          |