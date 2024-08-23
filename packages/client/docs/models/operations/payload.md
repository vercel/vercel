# Payload

## Example Usage

```typescript
import { Payload } from '@vercel/client/models/operations';

let value: Payload = {
  deploymentId: '<value>',
  id: '<id>',
  date: 7386.83,
  serial: '<value>',
};
```

## Fields

| Field          | Type                                                                                                               | Required           | Description |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `deploymentId` | _string_                                                                                                           | :heavy_check_mark: | N/A         |
| `info`         | [operations.GetDeploymentEventsResponseBodyInfo](../../models/operations/getdeploymenteventsresponsebodyinfo.md)   | :heavy_minus_sign: | N/A         |
| `text`         | _string_                                                                                                           | :heavy_minus_sign: | N/A         |
| `id`           | _string_                                                                                                           | :heavy_check_mark: | N/A         |
| `date`         | _number_                                                                                                           | :heavy_check_mark: | N/A         |
| `serial`       | _string_                                                                                                           | :heavy_check_mark: | N/A         |
| `created`      | _number_                                                                                                           | :heavy_minus_sign: | N/A         |
| `statusCode`   | _number_                                                                                                           | :heavy_minus_sign: | N/A         |
| `requestId`    | _string_                                                                                                           | :heavy_minus_sign: | N/A         |
| `proxy`        | [operations.GetDeploymentEventsResponseBodyProxy](../../models/operations/getdeploymenteventsresponsebodyproxy.md) | :heavy_minus_sign: | N/A         |
