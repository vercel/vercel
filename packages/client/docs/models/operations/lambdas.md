# Lambdas

A partial representation of a Build used by the deployment endpoint.

## Example Usage

```typescript
import { Lambdas } from '@vercel/client/models/operations';

let value: Lambdas = {
  output: [
    {
      path: '/var/mail',
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
| `readyState`   | [operations.CreateDeploymentDeploymentsReadyState](../../models/operations/createdeploymentdeploymentsreadystate.md) | :heavy_minus_sign: | N/A         |
| `readyStateAt` | _number_                                                                                                             | :heavy_minus_sign: | N/A         |
| `output`       | [operations.CreateDeploymentOutput](../../models/operations/createdeploymentoutput.md)[]                             | :heavy_check_mark: | N/A         |
