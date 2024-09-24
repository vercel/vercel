# GetDeploymentEventsResponseBodyDeployments2

## Example Usage

```typescript
import { GetDeploymentEventsResponseBodyDeployments2 } from "@vercel/sdk/models/operations/getdeploymentevents.js";

let value: GetDeploymentEventsResponseBodyDeployments2 = {
  type: "command",
  created: 4301.16,
  payload: {
    deploymentId: "<value>",
    id: "<id>",
    date: 6521.25,
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