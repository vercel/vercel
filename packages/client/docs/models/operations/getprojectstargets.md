# GetProjectsTargets

## Example Usage

```typescript
import { GetProjectsTargets } from '@vercel/client/models/operations';

let value: GetProjectsTargets = {
  createdAt: 2274.14,
  createdIn: '<value>',
  creator: {
    email: 'Deonte5@hotmail.com',
    uid: '<value>',
    username: 'Houston88',
  },
  deploymentHostname: '<value>',
  name: '<value>',
  id: '<id>',
  plan: 'hobby',
  private: false,
  readyState: 'CANCELED',
  type: 'LAMBDAS',
  url: 'http://perky-collar.name',
  userId: '<value>',
  previewCommentsEnabled: false,
};
```

## Fields

| Field                    | Type                                                                                                             | Required           | Description                                                    | Example |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------- | ------- |
| `alias`                  | _string_[]                                                                                                       | :heavy_minus_sign: | N/A                                                            |         |
| `aliasAssigned`          | _operations.GetProjectsProjectsAliasAssigned_                                                                    | :heavy_minus_sign: | N/A                                                            |         |
| `aliasError`             | [operations.GetProjectsProjectsAliasError](../../models/operations/getprojectsprojectsaliaserror.md)             | :heavy_minus_sign: | N/A                                                            |         |
| `aliasFinal`             | _string_                                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `automaticAliases`       | _string_[]                                                                                                       | :heavy_minus_sign: | N/A                                                            |         |
| `builds`                 | [operations.GetProjectsProjectsBuilds](../../models/operations/getprojectsprojectsbuilds.md)[]                   | :heavy_minus_sign: | N/A                                                            |         |
| `connectBuildsEnabled`   | _boolean_                                                                                                        | :heavy_minus_sign: | N/A                                                            |         |
| `connectConfigurationId` | _string_                                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `createdAt`              | _number_                                                                                                         | :heavy_check_mark: | N/A                                                            |         |
| `createdIn`              | _string_                                                                                                         | :heavy_check_mark: | N/A                                                            |         |
| `creator`                | [operations.GetProjectsProjectsCreator](../../models/operations/getprojectsprojectscreator.md)                   | :heavy_check_mark: | N/A                                                            |         |
| `deletedAt`              | _number_                                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `deploymentHostname`     | _string_                                                                                                         | :heavy_check_mark: | N/A                                                            |         |
| `name`                   | _string_                                                                                                         | :heavy_check_mark: | N/A                                                            |         |
| `forced`                 | _boolean_                                                                                                        | :heavy_minus_sign: | N/A                                                            |         |
| `id`                     | _string_                                                                                                         | :heavy_check_mark: | N/A                                                            |         |
| `meta`                   | Record<string, _string_>                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `monorepoManager`        | _string_                                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `plan`                   | [operations.GetProjectsProjectsPlan](../../models/operations/getprojectsprojectsplan.md)                         | :heavy_check_mark: | N/A                                                            |         |
| `private`                | _boolean_                                                                                                        | :heavy_check_mark: | N/A                                                            |         |
| `readyState`             | [operations.GetProjectsProjectsReadyState](../../models/operations/getprojectsprojectsreadystate.md)             | :heavy_check_mark: | N/A                                                            |         |
| `readySubstate`          | [operations.GetProjectsProjectsReadySubstate](../../models/operations/getprojectsprojectsreadysubstate.md)       | :heavy_minus_sign: | N/A                                                            |         |
| `requestedAt`            | _number_                                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `target`                 | _string_                                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `teamId`                 | _string_                                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `type`                   | [operations.GetProjectsProjectsResponseType](../../models/operations/getprojectsprojectsresponsetype.md)         | :heavy_check_mark: | N/A                                                            |         |
| `url`                    | _string_                                                                                                         | :heavy_check_mark: | N/A                                                            |         |
| `userId`                 | _string_                                                                                                         | :heavy_check_mark: | N/A                                                            |         |
| `withCache`              | _boolean_                                                                                                        | :heavy_minus_sign: | N/A                                                            |         |
| `checksConclusion`       | [operations.GetProjectsProjectsChecksConclusion](../../models/operations/getprojectsprojectschecksconclusion.md) | :heavy_minus_sign: | N/A                                                            |         |
| `checksState`            | [operations.GetProjectsProjectsChecksState](../../models/operations/getprojectsprojectschecksstate.md)           | :heavy_minus_sign: | N/A                                                            |         |
| `readyAt`                | _number_                                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `buildingAt`             | _number_                                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `previewCommentsEnabled` | _boolean_                                                                                                        | :heavy_minus_sign: | Whether or not preview comments are enabled for the deployment | false   |
| `oidcTokenClaims`        | Record<string, _operations.GetProjectsProjectsOidcTokenClaims_>                                                  | :heavy_minus_sign: | N/A                                                            |         |
