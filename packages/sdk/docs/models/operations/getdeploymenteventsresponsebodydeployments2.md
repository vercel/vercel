# GetDeploymentEventsResponseBodyDeployments2

## Example Usage

```typescript
import { GetDeploymentEventsResponseBodyDeployments2 } from "@vercel/sdk/models/operations";

let value: GetDeploymentEventsResponseBodyDeployments2 = {
  type: "middleware",
  created: 3807.29,
  payload: {
    deploymentId: "<value>",
    id: "<id>",
    date: 2460.63,
    serial: "<value>",
  },
};
```

## Fields

| Field                                                                                                                                                  | Type                                                                                                                                                   | Required                                                                                                                                               | Description                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`                                                                                                                                                 | [operations.GetDeploymentEventsResponseBodyDeploymentsResponseType](../../models/operations/getdeploymenteventsresponsebodydeploymentsresponsetype.md) | :heavy_check_mark:                                                                                                                                     | N/A                                                                                                                                                    |
| `created`                                                                                                                                              | *number*                                                                                                                                               | :heavy_check_mark:                                                                                                                                     | N/A                                                                                                                                                    |
| `payload`                                                                                                                                              | [operations.ResponseBodyPayload](../../models/operations/responsebodypayload.md)                                                                       | :heavy_check_mark:                                                                                                                                     | N/A                                                                                                                                                    |