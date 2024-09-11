# ResponseBodyLambdas

A partial representation of a Build used by the deployment endpoint.

## Example Usage

```typescript
import { ResponseBodyLambdas } from "@vercel/sdk/models/operations";

let value: ResponseBodyLambdas = {
  output: [
    {
      path: "/boot/defaults",
      functionName: "<value>",
    },
  ],
};
```

## Fields

| Field                                                                                                                                  | Type                                                                                                                                   | Required                                                                                                                               | Description                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                                                                                   | *string*                                                                                                                               | :heavy_minus_sign:                                                                                                                     | N/A                                                                                                                                    |
| `createdAt`                                                                                                                            | *number*                                                                                                                               | :heavy_minus_sign:                                                                                                                     | N/A                                                                                                                                    |
| `entrypoint`                                                                                                                           | *string*                                                                                                                               | :heavy_minus_sign:                                                                                                                     | N/A                                                                                                                                    |
| `readyState`                                                                                                                           | [operations.GetDeploymentResponseBodyDeploymentsReadyState](../../models/operations/getdeploymentresponsebodydeploymentsreadystate.md) | :heavy_minus_sign:                                                                                                                     | N/A                                                                                                                                    |
| `readyStateAt`                                                                                                                         | *number*                                                                                                                               | :heavy_minus_sign:                                                                                                                     | N/A                                                                                                                                    |
| `output`                                                                                                                               | [operations.GetDeploymentResponseBodyOutput](../../models/operations/getdeploymentresponsebodyoutput.md)[]                             | :heavy_check_mark:                                                                                                                     | N/A                                                                                                                                    |