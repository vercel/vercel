# UpdateProjectTargets

## Example Usage

```typescript
import { UpdateProjectTargets } from '@vercel/client/models/operations';

let value: UpdateProjectTargets = {
  createdAt: 1576.32,
  createdIn: '<value>',
  creator: {
    email: 'Zachery15@hotmail.com',
    uid: '<value>',
    username: 'Aurelie.Murphy',
  },
  deploymentHostname: '<value>',
  name: '<value>',
  id: '<id>',
  plan: 'hobby',
  private: false,
  readyState: 'BUILDING',
  type: 'LAMBDAS',
  url: 'https://impressive-icy.biz',
  userId: '<value>',
  previewCommentsEnabled: false,
};
```

## Fields

| Field                    | Type                                                                                                                 | Required           | Description                                                    | Example |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------- | ------- |
| `alias`                  | _string_[]                                                                                                           | :heavy_minus_sign: | N/A                                                            |         |
| `aliasAssigned`          | _operations.UpdateProjectProjectsAliasAssigned_                                                                      | :heavy_minus_sign: | N/A                                                            |         |
| `aliasError`             | [operations.UpdateProjectProjectsAliasError](../../models/operations/updateprojectprojectsaliaserror.md)             | :heavy_minus_sign: | N/A                                                            |         |
| `aliasFinal`             | _string_                                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `automaticAliases`       | _string_[]                                                                                                           | :heavy_minus_sign: | N/A                                                            |         |
| `builds`                 | [operations.UpdateProjectProjectsBuilds](../../models/operations/updateprojectprojectsbuilds.md)[]                   | :heavy_minus_sign: | N/A                                                            |         |
| `connectBuildsEnabled`   | _boolean_                                                                                                            | :heavy_minus_sign: | N/A                                                            |         |
| `connectConfigurationId` | _string_                                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `createdAt`              | _number_                                                                                                             | :heavy_check_mark: | N/A                                                            |         |
| `createdIn`              | _string_                                                                                                             | :heavy_check_mark: | N/A                                                            |         |
| `creator`                | [operations.UpdateProjectProjectsCreator](../../models/operations/updateprojectprojectscreator.md)                   | :heavy_check_mark: | N/A                                                            |         |
| `deletedAt`              | _number_                                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `deploymentHostname`     | _string_                                                                                                             | :heavy_check_mark: | N/A                                                            |         |
| `name`                   | _string_                                                                                                             | :heavy_check_mark: | N/A                                                            |         |
| `forced`                 | _boolean_                                                                                                            | :heavy_minus_sign: | N/A                                                            |         |
| `id`                     | _string_                                                                                                             | :heavy_check_mark: | N/A                                                            |         |
| `meta`                   | Record<string, _string_>                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `monorepoManager`        | _string_                                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `plan`                   | [operations.UpdateProjectProjectsPlan](../../models/operations/updateprojectprojectsplan.md)                         | :heavy_check_mark: | N/A                                                            |         |
| `private`                | _boolean_                                                                                                            | :heavy_check_mark: | N/A                                                            |         |
| `readyState`             | [operations.UpdateProjectProjectsReadyState](../../models/operations/updateprojectprojectsreadystate.md)             | :heavy_check_mark: | N/A                                                            |         |
| `readySubstate`          | [operations.UpdateProjectProjectsReadySubstate](../../models/operations/updateprojectprojectsreadysubstate.md)       | :heavy_minus_sign: | N/A                                                            |         |
| `requestedAt`            | _number_                                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `target`                 | _string_                                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `teamId`                 | _string_                                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `type`                   | [operations.UpdateProjectProjectsResponseType](../../models/operations/updateprojectprojectsresponsetype.md)         | :heavy_check_mark: | N/A                                                            |         |
| `url`                    | _string_                                                                                                             | :heavy_check_mark: | N/A                                                            |         |
| `userId`                 | _string_                                                                                                             | :heavy_check_mark: | N/A                                                            |         |
| `withCache`              | _boolean_                                                                                                            | :heavy_minus_sign: | N/A                                                            |         |
| `checksConclusion`       | [operations.UpdateProjectProjectsChecksConclusion](../../models/operations/updateprojectprojectschecksconclusion.md) | :heavy_minus_sign: | N/A                                                            |         |
| `checksState`            | [operations.UpdateProjectProjectsChecksState](../../models/operations/updateprojectprojectschecksstate.md)           | :heavy_minus_sign: | N/A                                                            |         |
| `readyAt`                | _number_                                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `buildingAt`             | _number_                                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `previewCommentsEnabled` | _boolean_                                                                                                            | :heavy_minus_sign: | Whether or not preview comments are enabled for the deployment | false   |
| `oidcTokenClaims`        | Record<string, _operations.UpdateProjectProjectsOidcTokenClaims_>                                                    | :heavy_minus_sign: | N/A                                                            |         |
