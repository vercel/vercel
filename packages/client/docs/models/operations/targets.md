# Targets

## Example Usage

```typescript
import { Targets } from '@vercel/client/models/operations';

let value: Targets = {
  createdAt: 8960.39,
  createdIn: '<value>',
  creator: {
    email: 'Loyce_Fadel68@yahoo.com',
    uid: '<value>',
    username: 'Isadore_Kirlin69',
  },
  deploymentHostname: '<value>',
  name: '<value>',
  id: '<id>',
  plan: 'pro',
  private: false,
  readyState: 'ERROR',
  type: 'LAMBDAS',
  url: 'https://stupendous-handmaiden.info',
  userId: '<value>',
  previewCommentsEnabled: false,
};
```

## Fields

| Field                    | Type                                                                                                                           | Required           | Description                                                    | Example |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------------- | ------- |
| `alias`                  | _string_[]                                                                                                                     | :heavy_minus_sign: | N/A                                                            |         |
| `aliasAssigned`          | _operations.UpdateProjectDataCacheAliasAssigned_                                                                               | :heavy_minus_sign: | N/A                                                            |         |
| `aliasError`             | [operations.UpdateProjectDataCacheAliasError](../../models/operations/updateprojectdatacachealiaserror.md)                     | :heavy_minus_sign: | N/A                                                            |         |
| `aliasFinal`             | _string_                                                                                                                       | :heavy_minus_sign: | N/A                                                            |         |
| `automaticAliases`       | _string_[]                                                                                                                     | :heavy_minus_sign: | N/A                                                            |         |
| `builds`                 | [operations.UpdateProjectDataCacheProjectsBuilds](../../models/operations/updateprojectdatacacheprojectsbuilds.md)[]           | :heavy_minus_sign: | N/A                                                            |         |
| `connectBuildsEnabled`   | _boolean_                                                                                                                      | :heavy_minus_sign: | N/A                                                            |         |
| `connectConfigurationId` | _string_                                                                                                                       | :heavy_minus_sign: | N/A                                                            |         |
| `createdAt`              | _number_                                                                                                                       | :heavy_check_mark: | N/A                                                            |         |
| `createdIn`              | _string_                                                                                                                       | :heavy_check_mark: | N/A                                                            |         |
| `creator`                | [operations.UpdateProjectDataCacheCreator](../../models/operations/updateprojectdatacachecreator.md)                           | :heavy_check_mark: | N/A                                                            |         |
| `deletedAt`              | _number_                                                                                                                       | :heavy_minus_sign: | N/A                                                            |         |
| `deploymentHostname`     | _string_                                                                                                                       | :heavy_check_mark: | N/A                                                            |         |
| `name`                   | _string_                                                                                                                       | :heavy_check_mark: | N/A                                                            |         |
| `forced`                 | _boolean_                                                                                                                      | :heavy_minus_sign: | N/A                                                            |         |
| `id`                     | _string_                                                                                                                       | :heavy_check_mark: | N/A                                                            |         |
| `meta`                   | Record<string, _string_>                                                                                                       | :heavy_minus_sign: | N/A                                                            |         |
| `monorepoManager`        | _string_                                                                                                                       | :heavy_minus_sign: | N/A                                                            |         |
| `plan`                   | [operations.UpdateProjectDataCachePlan](../../models/operations/updateprojectdatacacheplan.md)                                 | :heavy_check_mark: | N/A                                                            |         |
| `private`                | _boolean_                                                                                                                      | :heavy_check_mark: | N/A                                                            |         |
| `readyState`             | [operations.UpdateProjectDataCacheProjectsReadyState](../../models/operations/updateprojectdatacacheprojectsreadystate.md)     | :heavy_check_mark: | N/A                                                            |         |
| `readySubstate`          | [operations.UpdateProjectDataCacheReadySubstate](../../models/operations/updateprojectdatacachereadysubstate.md)               | :heavy_minus_sign: | N/A                                                            |         |
| `requestedAt`            | _number_                                                                                                                       | :heavy_minus_sign: | N/A                                                            |         |
| `target`                 | _string_                                                                                                                       | :heavy_minus_sign: | N/A                                                            |         |
| `teamId`                 | _string_                                                                                                                       | :heavy_minus_sign: | N/A                                                            |         |
| `type`                   | [operations.UpdateProjectDataCacheProjectsResponseType](../../models/operations/updateprojectdatacacheprojectsresponsetype.md) | :heavy_check_mark: | N/A                                                            |         |
| `url`                    | _string_                                                                                                                       | :heavy_check_mark: | N/A                                                            |         |
| `userId`                 | _string_                                                                                                                       | :heavy_check_mark: | N/A                                                            |         |
| `withCache`              | _boolean_                                                                                                                      | :heavy_minus_sign: | N/A                                                            |         |
| `checksConclusion`       | [operations.UpdateProjectDataCacheChecksConclusion](../../models/operations/updateprojectdatacachechecksconclusion.md)         | :heavy_minus_sign: | N/A                                                            |         |
| `checksState`            | [operations.UpdateProjectDataCacheChecksState](../../models/operations/updateprojectdatacachechecksstate.md)                   | :heavy_minus_sign: | N/A                                                            |         |
| `readyAt`                | _number_                                                                                                                       | :heavy_minus_sign: | N/A                                                            |         |
| `buildingAt`             | _number_                                                                                                                       | :heavy_minus_sign: | N/A                                                            |         |
| `previewCommentsEnabled` | _boolean_                                                                                                                      | :heavy_minus_sign: | Whether or not preview comments are enabled for the deployment | false   |
| `oidcTokenClaims`        | Record<string, _operations.UpdateProjectDataCacheOidcTokenClaims_>                                                             | :heavy_minus_sign: | N/A                                                            |         |
