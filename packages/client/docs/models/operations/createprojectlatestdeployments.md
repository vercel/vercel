# CreateProjectLatestDeployments

## Example Usage

```typescript
import { CreateProjectLatestDeployments } from '@vercel/client/models/operations';

let value: CreateProjectLatestDeployments = {
  createdAt: 456.14,
  createdIn: '<value>',
  creator: {
    email: 'Corene24@hotmail.com',
    uid: '<value>',
    username: 'Marianne1',
  },
  deploymentHostname: '<value>',
  name: '<value>',
  id: '<id>',
  plan: 'enterprise',
  private: false,
  readyState: 'CANCELED',
  type: 'LAMBDAS',
  url: 'http://questionable-specialist.net',
  userId: '<value>',
  previewCommentsEnabled: false,
};
```

## Fields

| Field                    | Type                                                                                                               | Required           | Description                                                    | Example |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------------- | ------- |
| `alias`                  | _string_[]                                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `aliasAssigned`          | _operations.CreateProjectAliasAssigned_                                                                            | :heavy_minus_sign: | N/A                                                            |         |
| `aliasError`             | [operations.CreateProjectAliasError](../../models/operations/createprojectaliaserror.md)                           | :heavy_minus_sign: | N/A                                                            |         |
| `aliasFinal`             | _string_                                                                                                           | :heavy_minus_sign: | N/A                                                            |         |
| `automaticAliases`       | _string_[]                                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `builds`                 | [operations.CreateProjectBuilds](../../models/operations/createprojectbuilds.md)[]                                 | :heavy_minus_sign: | N/A                                                            |         |
| `connectBuildsEnabled`   | _boolean_                                                                                                          | :heavy_minus_sign: | N/A                                                            |         |
| `connectConfigurationId` | _string_                                                                                                           | :heavy_minus_sign: | N/A                                                            |         |
| `createdAt`              | _number_                                                                                                           | :heavy_check_mark: | N/A                                                            |         |
| `createdIn`              | _string_                                                                                                           | :heavy_check_mark: | N/A                                                            |         |
| `creator`                | [operations.CreateProjectCreator](../../models/operations/createprojectcreator.md)                                 | :heavy_check_mark: | N/A                                                            |         |
| `deletedAt`              | _number_                                                                                                           | :heavy_minus_sign: | N/A                                                            |         |
| `deploymentHostname`     | _string_                                                                                                           | :heavy_check_mark: | N/A                                                            |         |
| `name`                   | _string_                                                                                                           | :heavy_check_mark: | N/A                                                            |         |
| `forced`                 | _boolean_                                                                                                          | :heavy_minus_sign: | N/A                                                            |         |
| `id`                     | _string_                                                                                                           | :heavy_check_mark: | N/A                                                            |         |
| `meta`                   | Record<string, _string_>                                                                                           | :heavy_minus_sign: | N/A                                                            |         |
| `monorepoManager`        | _string_                                                                                                           | :heavy_minus_sign: | N/A                                                            |         |
| `plan`                   | [operations.CreateProjectPlan](../../models/operations/createprojectplan.md)                                       | :heavy_check_mark: | N/A                                                            |         |
| `private`                | _boolean_                                                                                                          | :heavy_check_mark: | N/A                                                            |         |
| `readyState`             | [operations.CreateProjectReadyState](../../models/operations/createprojectreadystate.md)                           | :heavy_check_mark: | N/A                                                            |         |
| `readySubstate`          | [operations.CreateProjectReadySubstate](../../models/operations/createprojectreadysubstate.md)                     | :heavy_minus_sign: | N/A                                                            |         |
| `requestedAt`            | _number_                                                                                                           | :heavy_minus_sign: | N/A                                                            |         |
| `target`                 | _string_                                                                                                           | :heavy_minus_sign: | N/A                                                            |         |
| `teamId`                 | _string_                                                                                                           | :heavy_minus_sign: | N/A                                                            |         |
| `type`                   | [operations.CreateProjectProjectsResponse200Type](../../models/operations/createprojectprojectsresponse200type.md) | :heavy_check_mark: | N/A                                                            |         |
| `url`                    | _string_                                                                                                           | :heavy_check_mark: | N/A                                                            |         |
| `userId`                 | _string_                                                                                                           | :heavy_check_mark: | N/A                                                            |         |
| `withCache`              | _boolean_                                                                                                          | :heavy_minus_sign: | N/A                                                            |         |
| `checksConclusion`       | [operations.CreateProjectChecksConclusion](../../models/operations/createprojectchecksconclusion.md)               | :heavy_minus_sign: | N/A                                                            |         |
| `checksState`            | [operations.CreateProjectChecksState](../../models/operations/createprojectchecksstate.md)                         | :heavy_minus_sign: | N/A                                                            |         |
| `readyAt`                | _number_                                                                                                           | :heavy_minus_sign: | N/A                                                            |         |
| `buildingAt`             | _number_                                                                                                           | :heavy_minus_sign: | N/A                                                            |         |
| `previewCommentsEnabled` | _boolean_                                                                                                          | :heavy_minus_sign: | Whether or not preview comments are enabled for the deployment | false   |
| `oidcTokenClaims`        | Record<string, _operations.CreateProjectOidcTokenClaims_>                                                          | :heavy_minus_sign: | N/A                                                            |         |
