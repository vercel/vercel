# ResponseBodyLambdas

A partial representation of a Build used by the deployment endpoint.

## Example Usage

```typescript
import { ResponseBodyLambdas } from '@vercel/client/models/operations';

let value: ResponseBodyLambdas = {
  output: [
    {
      path: '/opt/include',
      functionName: '<value>',
    },
  ],
};
```

## Fields

| Field          | Type                                                                                                                                   | Required           | Description |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `id`           | _string_                                                                                                                               | :heavy_minus_sign: | N/A         |
| `createdAt`    | _number_                                                                                                                               | :heavy_minus_sign: | N/A         |
| `entrypoint`   | _string_                                                                                                                               | :heavy_minus_sign: | N/A         |
| `readyState`   | [operations.GetDeploymentResponseBodyDeploymentsReadyState](../../models/operations/getdeploymentresponsebodydeploymentsreadystate.md) | :heavy_minus_sign: | N/A         |
| `readyStateAt` | _number_                                                                                                                               | :heavy_minus_sign: | N/A         |
| `output`       | [operations.GetDeploymentResponseBodyOutput](../../models/operations/getdeploymentresponsebodyoutput.md)[]                             | :heavy_check_mark: | N/A         |
