# Builds

An object representing a Build on Vercel

## Example Usage

```typescript
import { Builds } from '@vercel/client/models/operations';

let value: Builds = {
  id: '<id>',
  deploymentId: '<value>',
  entrypoint: '<value>',
  readyState: 'ARCHIVED',
  output: [
    {
      path: '/usr/sbin',
      digest: '<value>',
      mode: 5448.83,
    },
  ],
};
```

## Fields

| Field          | Type                                                                                             | Required           | Description                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------- |
| `id`           | _string_                                                                                         | :heavy_check_mark: | The unique identifier of the Build                                                                        |
| `deploymentId` | _string_                                                                                         | :heavy_check_mark: | The unique identifier of the deployment                                                                   |
| `entrypoint`   | _string_                                                                                         | :heavy_check_mark: | The entrypoint of the deployment                                                                          |
| `readyState`   | [operations.ReadyState](../../models/operations/readystate.md)                                   | :heavy_check_mark: | The state of the deployment depending on the process of deploying, or if it is ready or in an error state |
| `readyStateAt` | _number_                                                                                         | :heavy_minus_sign: | The time at which the Build state was last modified                                                       |
| `scheduledAt`  | _number_                                                                                         | :heavy_minus_sign: | The time at which the Build was scheduled to be built                                                     |
| `createdAt`    | _number_                                                                                         | :heavy_minus_sign: | The time at which the Build was created                                                                   |
| `deployedAt`   | _number_                                                                                         | :heavy_minus_sign: | The time at which the Build was deployed                                                                  |
| `createdIn`    | _string_                                                                                         | :heavy_minus_sign: | The region where the Build was first created                                                              |
| `use`          | _string_                                                                                         | :heavy_minus_sign: | The Runtime the Build used to generate the output                                                         |
| `config`       | [operations.Config](../../models/operations/config.md)                                           | :heavy_minus_sign: | An object that contains the Build's configuration                                                         |
| `output`       | [operations.ListDeploymentBuildsOutput](../../models/operations/listdeploymentbuildsoutput.md)[] | :heavy_check_mark: | A list of outputs for the Build that can be either Serverless Functions or static files                   |
| `fingerprint`  | _string_                                                                                         | :heavy_minus_sign: | If the Build uses the `@vercel/static` Runtime, it contains a hashed string of all outputs                |
| `copiedFrom`   | _string_                                                                                         | :heavy_minus_sign: | N/A                                                                                                       |
