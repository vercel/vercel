# CancelDeploymentLambdas

A partial representation of a Build used by the deployment endpoint.

## Example Usage

```typescript
import { CancelDeploymentLambdas } from '@vercel/client/models/operations';

let value: CancelDeploymentLambdas = {
  output: [
    {
      path: '/etc/namedb',
      functionName: '<value>',
    },
  ],
};
```

## Fields

| Field          | Type                                                                                                                 | Required           | Description |
| -------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `id`           | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `createdAt`    | _number_                                                                                                             | :heavy_minus_sign: | N/A         |
| `entrypoint`   | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `readyState`   | [operations.CancelDeploymentDeploymentsReadyState](../../models/operations/canceldeploymentdeploymentsreadystate.md) | :heavy_minus_sign: | N/A         |
| `readyStateAt` | _number_                                                                                                             | :heavy_minus_sign: | N/A         |
| `output`       | [operations.CancelDeploymentOutput](../../models/operations/canceldeploymentoutput.md)[]                             | :heavy_check_mark: | N/A         |
