# UpdateProjectLatestDeployments

## Example Usage

```typescript
import { UpdateProjectLatestDeployments } from '@vercel/client/models/operations';

let value: UpdateProjectLatestDeployments = {
  createdAt: 7836.48,
  createdIn: '<value>',
  creator: {
    email: 'Kaylie53@yahoo.com',
    uid: '<value>',
    username: 'Buddy.Parker',
  },
  deploymentHostname: '<value>',
  name: '<value>',
  id: '<id>',
  plan: 'enterprise',
  private: false,
  readyState: 'BUILDING',
  type: 'LAMBDAS',
  url: 'http://hospitable-chance.org',
  userId: '<value>',
  previewCommentsEnabled: false,
};
```

## Fields

| Field                    | Type                                                                                                 | Required           | Description                                                    | Example |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------- | ------- |
| `alias`                  | _string_[]                                                                                           | :heavy_minus_sign: | N/A                                                            |         |
| `aliasAssigned`          | _operations.UpdateProjectAliasAssigned_                                                              | :heavy_minus_sign: | N/A                                                            |         |
| `aliasError`             | [operations.UpdateProjectAliasError](../../models/operations/updateprojectaliaserror.md)             | :heavy_minus_sign: | N/A                                                            |         |
| `aliasFinal`             | _string_                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `automaticAliases`       | _string_[]                                                                                           | :heavy_minus_sign: | N/A                                                            |         |
| `builds`                 | [operations.UpdateProjectBuilds](../../models/operations/updateprojectbuilds.md)[]                   | :heavy_minus_sign: | N/A                                                            |         |
| `connectBuildsEnabled`   | _boolean_                                                                                            | :heavy_minus_sign: | N/A                                                            |         |
| `connectConfigurationId` | _string_                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `createdAt`              | _number_                                                                                             | :heavy_check_mark: | N/A                                                            |         |
| `createdIn`              | _string_                                                                                             | :heavy_check_mark: | N/A                                                            |         |
| `creator`                | [operations.UpdateProjectCreator](../../models/operations/updateprojectcreator.md)                   | :heavy_check_mark: | N/A                                                            |         |
| `deletedAt`              | _number_                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `deploymentHostname`     | _string_                                                                                             | :heavy_check_mark: | N/A                                                            |         |
| `name`                   | _string_                                                                                             | :heavy_check_mark: | N/A                                                            |         |
| `forced`                 | _boolean_                                                                                            | :heavy_minus_sign: | N/A                                                            |         |
| `id`                     | _string_                                                                                             | :heavy_check_mark: | N/A                                                            |         |
| `meta`                   | Record<string, _string_>                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `monorepoManager`        | _string_                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `plan`                   | [operations.UpdateProjectPlan](../../models/operations/updateprojectplan.md)                         | :heavy_check_mark: | N/A                                                            |         |
| `private`                | _boolean_                                                                                            | :heavy_check_mark: | N/A                                                            |         |
| `readyState`             | [operations.UpdateProjectReadyState](../../models/operations/updateprojectreadystate.md)             | :heavy_check_mark: | N/A                                                            |         |
| `readySubstate`          | [operations.UpdateProjectReadySubstate](../../models/operations/updateprojectreadysubstate.md)       | :heavy_minus_sign: | N/A                                                            |         |
| `requestedAt`            | _number_                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `target`                 | _string_                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `teamId`                 | _string_                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `type`                   | [operations.UpdateProjectProjectsType](../../models/operations/updateprojectprojectstype.md)         | :heavy_check_mark: | N/A                                                            |         |
| `url`                    | _string_                                                                                             | :heavy_check_mark: | N/A                                                            |         |
| `userId`                 | _string_                                                                                             | :heavy_check_mark: | N/A                                                            |         |
| `withCache`              | _boolean_                                                                                            | :heavy_minus_sign: | N/A                                                            |         |
| `checksConclusion`       | [operations.UpdateProjectChecksConclusion](../../models/operations/updateprojectchecksconclusion.md) | :heavy_minus_sign: | N/A                                                            |         |
| `checksState`            | [operations.UpdateProjectChecksState](../../models/operations/updateprojectchecksstate.md)           | :heavy_minus_sign: | N/A                                                            |         |
| `readyAt`                | _number_                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `buildingAt`             | _number_                                                                                             | :heavy_minus_sign: | N/A                                                            |         |
| `previewCommentsEnabled` | _boolean_                                                                                            | :heavy_minus_sign: | Whether or not preview comments are enabled for the deployment | false   |
| `oidcTokenClaims`        | Record<string, _operations.UpdateProjectOidcTokenClaims_>                                            | :heavy_minus_sign: | N/A                                                            |         |
