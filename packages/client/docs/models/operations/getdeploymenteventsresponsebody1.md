# GetDeploymentEventsResponseBody1

## Example Usage

```typescript
import { GetDeploymentEventsResponseBody1 } from '@vercel/client/models/operations';

let value: GetDeploymentEventsResponseBody1 = {
  created: 8970.71,
  date: 2965.56,
  deploymentId: '<value>',
  id: '<id>',
  info: {
    type: '<value>',
    name: '<value>',
  },
  serial: '<value>',
  type: 'stdout',
};
```

## Fields

| Field          | Type                                                                                                                                                         | Required           | Description |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `created`      | _number_                                                                                                                                                     | :heavy_check_mark: | N/A         |
| `date`         | _number_                                                                                                                                                     | :heavy_check_mark: | N/A         |
| `deploymentId` | _string_                                                                                                                                                     | :heavy_check_mark: | N/A         |
| `id`           | _string_                                                                                                                                                     | :heavy_check_mark: | N/A         |
| `info`         | [operations.Info](../../models/operations/info.md)                                                                                                           | :heavy_check_mark: | N/A         |
| `proxy`        | [operations.Proxy](../../models/operations/proxy.md)                                                                                                         | :heavy_minus_sign: | N/A         |
| `requestId`    | _string_                                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `serial`       | _string_                                                                                                                                                     | :heavy_check_mark: | N/A         |
| `statusCode`   | _number_                                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `text`         | _string_                                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `type`         | [operations.GetDeploymentEventsResponseBodyDeploymentsResponse200Type](../../models/operations/getdeploymenteventsresponsebodydeploymentsresponse200type.md) | :heavy_check_mark: | N/A         |
