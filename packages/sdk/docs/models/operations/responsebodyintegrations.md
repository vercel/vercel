# ResponseBodyIntegrations

## Example Usage

```typescript
import { ResponseBodyIntegrations } from "@vercel/sdk/models/operations/getdeployment.js";

let value: ResponseBodyIntegrations = {
  status: "skipped",
  startedAt: 6837.26,
};
```

## Fields

| Field                                                                                                                          | Type                                                                                                                           | Required                                                                                                                       | Description                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `status`                                                                                                                       | [operations.GetDeploymentResponseBodyDeploymentsStatus](../../models/operations/getdeploymentresponsebodydeploymentsstatus.md) | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |
| `startedAt`                                                                                                                    | *number*                                                                                                                       | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |
| `completedAt`                                                                                                                  | *number*                                                                                                                       | :heavy_minus_sign:                                                                                                             | N/A                                                                                                                            |
| `skippedAt`                                                                                                                    | *number*                                                                                                                       | :heavy_minus_sign:                                                                                                             | N/A                                                                                                                            |
| `skippedBy`                                                                                                                    | *string*                                                                                                                       | :heavy_minus_sign:                                                                                                             | N/A                                                                                                                            |