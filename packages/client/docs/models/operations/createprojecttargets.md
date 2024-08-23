# CreateProjectTargets

## Example Usage

```typescript
import { CreateProjectTargets } from '@vercel/client/models/operations';

let value: CreateProjectTargets = {
  createdAt: 4104.92,
  createdIn: '<value>',
  creator: {
    email: 'Hilbert18@gmail.com',
    uid: '<value>',
    username: 'Greta22',
  },
  deploymentHostname: '<value>',
  name: '<value>',
  id: '<id>',
  plan: 'hobby',
  private: false,
  readyState: 'BUILDING',
  type: 'LAMBDAS',
  url: 'http://torn-mixer.org',
  userId: '<value>',
  previewCommentsEnabled: false,
};
```

## Fields

| Field                    | Type                                                                                                                                             | Required           | Description                                                    | Example |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------------- | ------- |
| `alias`                  | _string_[]                                                                                                                                       | :heavy_minus_sign: | N/A                                                            |         |
| `aliasAssigned`          | _operations.CreateProjectProjectsAliasAssigned_                                                                                                  | :heavy_minus_sign: | N/A                                                            |         |
| `aliasError`             | [operations.CreateProjectProjectsAliasError](../../models/operations/createprojectprojectsaliaserror.md)                                         | :heavy_minus_sign: | N/A                                                            |         |
| `aliasFinal`             | _string_                                                                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `automaticAliases`       | _string_[]                                                                                                                                       | :heavy_minus_sign: | N/A                                                            |         |
| `builds`                 | [operations.CreateProjectProjectsBuilds](../../models/operations/createprojectprojectsbuilds.md)[]                                               | :heavy_minus_sign: | N/A                                                            |         |
| `connectBuildsEnabled`   | _boolean_                                                                                                                                        | :heavy_minus_sign: | N/A                                                            |         |
| `connectConfigurationId` | _string_                                                                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `createdAt`              | _number_                                                                                                                                         | :heavy_check_mark: | N/A                                                            |         |
| `createdIn`              | _string_                                                                                                                                         | :heavy_check_mark: | N/A                                                            |         |
| `creator`                | [operations.CreateProjectProjectsCreator](../../models/operations/createprojectprojectscreator.md)                                               | :heavy_check_mark: | N/A                                                            |         |
| `deletedAt`              | _number_                                                                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `deploymentHostname`     | _string_                                                                                                                                         | :heavy_check_mark: | N/A                                                            |         |
| `name`                   | _string_                                                                                                                                         | :heavy_check_mark: | N/A                                                            |         |
| `forced`                 | _boolean_                                                                                                                                        | :heavy_minus_sign: | N/A                                                            |         |
| `id`                     | _string_                                                                                                                                         | :heavy_check_mark: | N/A                                                            |         |
| `meta`                   | Record<string, _string_>                                                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `monorepoManager`        | _string_                                                                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `plan`                   | [operations.CreateProjectProjectsPlan](../../models/operations/createprojectprojectsplan.md)                                                     | :heavy_check_mark: | N/A                                                            |         |
| `private`                | _boolean_                                                                                                                                        | :heavy_check_mark: | N/A                                                            |         |
| `readyState`             | [operations.CreateProjectProjectsReadyState](../../models/operations/createprojectprojectsreadystate.md)                                         | :heavy_check_mark: | N/A                                                            |         |
| `readySubstate`          | [operations.CreateProjectProjectsReadySubstate](../../models/operations/createprojectprojectsreadysubstate.md)                                   | :heavy_minus_sign: | N/A                                                            |         |
| `requestedAt`            | _number_                                                                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `target`                 | _string_                                                                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `teamId`                 | _string_                                                                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `type`                   | [operations.CreateProjectProjectsResponse200ApplicationJSONType](../../models/operations/createprojectprojectsresponse200applicationjsontype.md) | :heavy_check_mark: | N/A                                                            |         |
| `url`                    | _string_                                                                                                                                         | :heavy_check_mark: | N/A                                                            |         |
| `userId`                 | _string_                                                                                                                                         | :heavy_check_mark: | N/A                                                            |         |
| `withCache`              | _boolean_                                                                                                                                        | :heavy_minus_sign: | N/A                                                            |         |
| `checksConclusion`       | [operations.CreateProjectProjectsChecksConclusion](../../models/operations/createprojectprojectschecksconclusion.md)                             | :heavy_minus_sign: | N/A                                                            |         |
| `checksState`            | [operations.CreateProjectProjectsChecksState](../../models/operations/createprojectprojectschecksstate.md)                                       | :heavy_minus_sign: | N/A                                                            |         |
| `readyAt`                | _number_                                                                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `buildingAt`             | _number_                                                                                                                                         | :heavy_minus_sign: | N/A                                                            |         |
| `previewCommentsEnabled` | _boolean_                                                                                                                                        | :heavy_minus_sign: | Whether or not preview comments are enabled for the deployment | false   |
| `oidcTokenClaims`        | Record<string, _operations.CreateProjectProjectsOidcTokenClaims_>                                                                                | :heavy_minus_sign: | N/A                                                            |         |
