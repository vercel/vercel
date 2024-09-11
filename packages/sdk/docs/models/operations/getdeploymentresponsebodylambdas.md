# GetDeploymentResponseBodyLambdas

A partial representation of a Build used by the deployment endpoint.

## Example Usage

```typescript
import { GetDeploymentResponseBodyLambdas } from "@vercel/sdk/models/operations";

let value: GetDeploymentResponseBodyLambdas = {
  output: [
    {
      path: "/dev",
      functionName: "<value>",
    },
  ],
};
```

## Fields

| Field                                                                                                                                                  | Type                                                                                                                                                   | Required                                                                                                                                               | Description                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                                                                                                                                   | *string*                                                                                                                                               | :heavy_minus_sign:                                                                                                                                     | N/A                                                                                                                                                    |
| `createdAt`                                                                                                                                            | *number*                                                                                                                                               | :heavy_minus_sign:                                                                                                                                     | N/A                                                                                                                                                    |
| `entrypoint`                                                                                                                                           | *string*                                                                                                                                               | :heavy_minus_sign:                                                                                                                                     | N/A                                                                                                                                                    |
| `readyState`                                                                                                                                           | [operations.GetDeploymentResponseBodyDeploymentsResponseReadyState](../../models/operations/getdeploymentresponsebodydeploymentsresponsereadystate.md) | :heavy_minus_sign:                                                                                                                                     | N/A                                                                                                                                                    |
| `readyStateAt`                                                                                                                                         | *number*                                                                                                                                               | :heavy_minus_sign:                                                                                                                                     | N/A                                                                                                                                                    |
| `output`                                                                                                                                               | [operations.ResponseBodyOutput](../../models/operations/responsebodyoutput.md)[]                                                                       | :heavy_check_mark:                                                                                                                                     | N/A                                                                                                                                                    |