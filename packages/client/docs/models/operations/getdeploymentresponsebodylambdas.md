# GetDeploymentResponseBodyLambdas

A partial representation of a Build used by the deployment endpoint.

## Example Usage

```typescript
import { GetDeploymentResponseBodyLambdas } from '@vercel/client/models/operations';

let value: GetDeploymentResponseBodyLambdas = {
  output: [
    {
      path: '/dev',
      functionName: '<value>',
    },
  ],
};
```

## Fields

| Field          | Type                                                                                                                                                   | Required           | Description |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `id`           | _string_                                                                                                                                               | :heavy_minus_sign: | N/A         |
| `createdAt`    | _number_                                                                                                                                               | :heavy_minus_sign: | N/A         |
| `entrypoint`   | _string_                                                                                                                                               | :heavy_minus_sign: | N/A         |
| `readyState`   | [operations.GetDeploymentResponseBodyDeploymentsResponseReadyState](../../models/operations/getdeploymentresponsebodydeploymentsresponsereadystate.md) | :heavy_minus_sign: | N/A         |
| `readyStateAt` | _number_                                                                                                                                               | :heavy_minus_sign: | N/A         |
| `output`       | [operations.ResponseBodyOutput](../../models/operations/responsebodyoutput.md)[]                                                                       | :heavy_check_mark: | N/A         |
