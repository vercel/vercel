# GetDeploymentEventsResponseBody2

## Example Usage

```typescript
import { GetDeploymentEventsResponseBody2 } from "@vercel/sdk/models/operations/getdeploymentevents.js";

let value: GetDeploymentEventsResponseBody2 = {
  type: "fatal",
  created: 8611.23,
  payload: {
    deploymentId: "<id>",
    id: "<id>",
    date: 6176.57,
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