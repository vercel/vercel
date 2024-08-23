# ResponseBodyPayload

## Example Usage

```typescript
import { ResponseBodyPayload } from '@vercel/client/models/operations';

let value: ResponseBodyPayload = {
  deploymentId: '<value>',
  id: '<id>',
  date: 2414.18,
  serial: '<value>',
};
```

## Fields

| Field          | Type                                                                                                                                     | Required           | Description |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `deploymentId` | _string_                                                                                                                                 | :heavy_check_mark: | N/A         |
| `info`         | [operations.GetDeploymentEventsResponseBodyDeploymentsInfo](../../models/operations/getdeploymenteventsresponsebodydeploymentsinfo.md)   | :heavy_minus_sign: | N/A         |
| `text`         | _string_                                                                                                                                 | :heavy_minus_sign: | N/A         |
| `id`           | _string_                                                                                                                                 | :heavy_check_mark: | N/A         |
| `date`         | _number_                                                                                                                                 | :heavy_check_mark: | N/A         |
| `serial`       | _string_                                                                                                                                 | :heavy_check_mark: | N/A         |
| `created`      | _number_                                                                                                                                 | :heavy_minus_sign: | N/A         |
| `statusCode`   | _number_                                                                                                                                 | :heavy_minus_sign: | N/A         |
| `requestId`    | _string_                                                                                                                                 | :heavy_minus_sign: | N/A         |
| `proxy`        | [operations.GetDeploymentEventsResponseBodyDeploymentsProxy](../../models/operations/getdeploymenteventsresponsebodydeploymentsproxy.md) | :heavy_minus_sign: | N/A         |
