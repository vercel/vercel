# Integrations

## Example Usage

```typescript
import { Integrations } from "@vercel/sdk/models/operations/createdeployment.js";

let value: Integrations = {
  status: "error",
  startedAt: 1023.17,
};
```

## Fields

| Field                                                                                                        | Type                                                                                                         | Required                                                                                                     | Description                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `status`                                                                                                     | [operations.CreateDeploymentDeploymentsStatus](../../models/operations/createdeploymentdeploymentsstatus.md) | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `startedAt`                                                                                                  | *number*                                                                                                     | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `completedAt`                                                                                                | *number*                                                                                                     | :heavy_minus_sign:                                                                                           | N/A                                                                                                          |
| `skippedAt`                                                                                                  | *number*                                                                                                     | :heavy_minus_sign:                                                                                           | N/A                                                                                                          |
| `skippedBy`                                                                                                  | *string*                                                                                                     | :heavy_minus_sign:                                                                                           | N/A                                                                                                          |