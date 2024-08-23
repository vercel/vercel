# GetDeploymentEventsResponseBodyDeployments1

## Example Usage

```typescript
import { GetDeploymentEventsResponseBodyDeployments1 } from '@vercel/client/models/operations';

let value: GetDeploymentEventsResponseBodyDeployments1 = {
  created: 5546.88,
  date: 4278.34,
  deploymentId: '<value>',
  id: '<id>',
  info: {
    type: '<value>',
    name: '<value>',
  },
  serial: '<value>',
  type: 'stderr',
};
```

## Fields

| Field          | Type                                                                                                                                   | Required           | Description |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `created`      | _number_                                                                                                                               | :heavy_check_mark: | N/A         |
| `date`         | _number_                                                                                                                               | :heavy_check_mark: | N/A         |
| `deploymentId` | _string_                                                                                                                               | :heavy_check_mark: | N/A         |
| `id`           | _string_                                                                                                                               | :heavy_check_mark: | N/A         |
| `info`         | [operations.ResponseBodyInfo](../../models/operations/responsebodyinfo.md)                                                             | :heavy_check_mark: | N/A         |
| `proxy`        | [operations.ResponseBodyProxy](../../models/operations/responsebodyproxy.md)                                                           | :heavy_minus_sign: | N/A         |
| `requestId`    | _string_                                                                                                                               | :heavy_minus_sign: | N/A         |
| `serial`       | _string_                                                                                                                               | :heavy_check_mark: | N/A         |
| `statusCode`   | _number_                                                                                                                               | :heavy_minus_sign: | N/A         |
| `text`         | _string_                                                                                                                               | :heavy_minus_sign: | N/A         |
| `type`         | [operations.GetDeploymentEventsResponseBodyDeploymentsType](../../models/operations/getdeploymenteventsresponsebodydeploymentstype.md) | :heavy_check_mark: | N/A         |
