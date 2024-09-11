# GetDeploymentEventsResponseBody2

## Example Usage

```typescript
import { GetDeploymentEventsResponseBody2 } from "@vercel/sdk/models/operations";

let value: GetDeploymentEventsResponseBody2 = {
  type: "deployment-state",
  created: 3485.19,
  payload: {
    deploymentId: "<value>",
    id: "<id>",
    date: 9372.85,
    serial: "<value>",
  },
};
```

## Fields

| Field                                                                                                            | Type                                                                                                             | Required                                                                                                         | Description                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `type`                                                                                                           | [operations.GetDeploymentEventsResponseBodyType](../../models/operations/getdeploymenteventsresponsebodytype.md) | :heavy_check_mark:                                                                                               | N/A                                                                                                              |
| `created`                                                                                                        | *number*                                                                                                         | :heavy_check_mark:                                                                                               | N/A                                                                                                              |
| `payload`                                                                                                        | [operations.Payload](../../models/operations/payload.md)                                                         | :heavy_check_mark:                                                                                               | N/A                                                                                                              |