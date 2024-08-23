# GetDeploymentEventsResponseBody2

## Example Usage

```typescript
import { GetDeploymentEventsResponseBody2 } from '@vercel/client/models/operations';

let value: GetDeploymentEventsResponseBody2 = {
  type: 'stderr',
  created: 4490.83,
  payload: {
    deploymentId: '<value>',
    id: '<id>',
    date: 3485.19,
    serial: '<value>',
  },
};
```

## Fields

| Field     | Type                                                                                                             | Required           | Description |
| --------- | ---------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `type`    | [operations.GetDeploymentEventsResponseBodyType](../../models/operations/getdeploymenteventsresponsebodytype.md) | :heavy_check_mark: | N/A         |
| `created` | _number_                                                                                                         | :heavy_check_mark: | N/A         |
| `payload` | [operations.Payload](../../models/operations/payload.md)                                                         | :heavy_check_mark: | N/A         |
