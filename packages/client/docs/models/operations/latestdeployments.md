# LatestDeployments

## Example Usage

```typescript
import { LatestDeployments } from '@vercel/client/models/operations';

let value: LatestDeployments = {
  createdAt: 7392.64,
  createdIn: '<value>',
  creator: {
    email: 'Alison97@gmail.com',
    uid: '<value>',
    username: 'Blanche48',
  },
  deploymentHostname: '<value>',
  name: '<value>',
  id: '<id>',
  plan: 'pro',
  private: false,
  readyState: 'READY',
  type: 'LAMBDAS',
  url: 'http://unacceptable-hare.org',
  userId: '<value>',
  previewCommentsEnabled: false,
};
```

## Fields

| Field                    | Type                                                                                                                                   | Required           | Description                                                    | Example |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------- | ------- |
| `alias`                  | _string_[]                                                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `aliasAssigned`          | _operations.AliasAssigned_                                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `aliasError`             | [operations.UpdateProjectDataCacheProjectsAliasError](../../models/operations/updateprojectdatacacheprojectsaliaserror.md)             | :heavy_minus_sign: | N/A                                                            |         |
| `aliasFinal`             | _string_                                                                                                                               | :heavy_minus_sign: | N/A                                                            |         |
| `automaticAliases`       | _string_[]                                                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `builds`                 | [operations.UpdateProjectDataCacheBuilds](../../models/operations/updateprojectdatacachebuilds.md)[]                                   | :heavy_minus_sign: | N/A                                                            |         |
| `connectBuildsEnabled`   | _boolean_                                                                                                                              | :heavy_minus_sign: | N/A                                                            |         |
| `connectConfigurationId` | _string_                                                                                                                               | :heavy_minus_sign: | N/A                                                            |         |
| `createdAt`              | _number_                                                                                                                               | :heavy_check_mark: | N/A                                                            |         |
| `createdIn`              | _string_                                                                                                                               | :heavy_check_mark: | N/A                                                            |         |
| `creator`                | [operations.UpdateProjectDataCacheProjectsCreator](../../models/operations/updateprojectdatacacheprojectscreator.md)                   | :heavy_check_mark: | N/A                                                            |         |
| `deletedAt`              | _number_                                                                                                                               | :heavy_minus_sign: | N/A                                                            |         |
| `deploymentHostname`     | _string_                                                                                                                               | :heavy_check_mark: | N/A                                                            |         |
| `name`                   | _string_                                                                                                                               | :heavy_check_mark: | N/A                                                            |         |
| `forced`                 | _boolean_                                                                                                                              | :heavy_minus_sign: | N/A                                                            |         |
| `id`                     | _string_                                                                                                                               | :heavy_check_mark: | N/A                                                            |         |
| `meta`                   | Record<string, _string_>                                                                                                               | :heavy_minus_sign: | N/A                                                            |         |
| `monorepoManager`        | _string_                                                                                                                               | :heavy_minus_sign: | N/A                                                            |         |
| `plan`                   | [operations.UpdateProjectDataCacheProjectsPlan](../../models/operations/updateprojectdatacacheprojectsplan.md)                         | :heavy_check_mark: | N/A                                                            |         |
| `private`                | _boolean_                                                                                                                              | :heavy_check_mark: | N/A                                                            |         |
| `readyState`             | [operations.UpdateProjectDataCacheReadyState](../../models/operations/updateprojectdatacachereadystate.md)                             | :heavy_check_mark: | N/A                                                            |         |
| `readySubstate`          | [operations.UpdateProjectDataCacheProjectsReadySubstate](../../models/operations/updateprojectdatacacheprojectsreadysubstate.md)       | :heavy_minus_sign: | N/A                                                            |         |
| `requestedAt`            | _number_                                                                                                                               | :heavy_minus_sign: | N/A                                                            |         |
| `target`                 | _string_                                                                                                                               | :heavy_minus_sign: | N/A                                                            |         |
| `teamId`                 | _string_                                                                                                                               | :heavy_minus_sign: | N/A                                                            |         |
| `type`                   | [operations.UpdateProjectDataCacheProjectsType](../../models/operations/updateprojectdatacacheprojectstype.md)                         | :heavy_check_mark: | N/A                                                            |         |
| `url`                    | _string_                                                                                                                               | :heavy_check_mark: | N/A                                                            |         |
| `userId`                 | _string_                                                                                                                               | :heavy_check_mark: | N/A                                                            |         |
| `withCache`              | _boolean_                                                                                                                              | :heavy_minus_sign: | N/A                                                            |         |
| `checksConclusion`       | [operations.UpdateProjectDataCacheProjectsChecksConclusion](../../models/operations/updateprojectdatacacheprojectschecksconclusion.md) | :heavy_minus_sign: | N/A                                                            |         |
| `checksState`            | [operations.UpdateProjectDataCacheProjectsChecksState](../../models/operations/updateprojectdatacacheprojectschecksstate.md)           | :heavy_minus_sign: | N/A                                                            |         |
| `readyAt`                | _number_                                                                                                                               | :heavy_minus_sign: | N/A                                                            |         |
| `buildingAt`             | _number_                                                                                                                               | :heavy_minus_sign: | N/A                                                            |         |
| `previewCommentsEnabled` | _boolean_                                                                                                                              | :heavy_minus_sign: | Whether or not preview comments are enabled for the deployment | false   |
| `oidcTokenClaims`        | Record<string, _operations.UpdateProjectDataCacheProjectsOidcTokenClaims_>                                                             | :heavy_minus_sign: | N/A                                                            |         |
