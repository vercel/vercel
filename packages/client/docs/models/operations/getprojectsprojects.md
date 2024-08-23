# GetProjectsProjects

## Example Usage

```typescript
import { GetProjectsProjects } from '@vercel/client/models/operations';

let value: GetProjectsProjects = {
  accountId: '<value>',
  crons: {
    enabledAt: 3246.83,
    disabledAt: 8310.49,
    updatedAt: 5197.11,
    deploymentId: '<value>',
    definitions: [
      {
        host: 'vercel.com',
        path: '/api/crons/sync-something?hello=world',
        schedule: '0 0 * * *',
      },
    ],
  },
  directoryListing: false,
  id: '<id>',
  latestDeployments: [
    {
      createdAt: 6289.82,
      createdIn: '<value>',
      creator: {
        email: 'Savion42@gmail.com',
        uid: '<value>',
        username: 'Pierre67',
      },
      deploymentHostname: '<value>',
      name: '<value>',
      id: '<id>',
      plan: 'hobby',
      private: false,
      readyState: 'INITIALIZING',
      type: 'LAMBDAS',
      url: 'https://left-cousin.net',
      userId: '<value>',
      previewCommentsEnabled: false,
    },
  ],
  name: '<value>',
  nodeVersion: '8.10.x',
  targets: {
    key: {
      createdAt: 2294.42,
      createdIn: '<value>',
      creator: {
        email: 'Shania21@hotmail.com',
        uid: '<value>',
        username: 'Vernice.Leannon',
      },
      deploymentHostname: '<value>',
      name: '<value>',
      id: '<id>',
      plan: 'hobby',
      private: false,
      readyState: 'ERROR',
      type: 'LAMBDAS',
      url: 'http://improbable-redhead.info',
      userId: '<value>',
      previewCommentsEnabled: false,
    },
  },
};
```

## Fields

| Field                                  | Type                                                                                                             | Required           | Description |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `accountId`                            | _string_                                                                                                         | :heavy_check_mark: | N/A         |
| `analytics`                            | [operations.GetProjectsAnalytics](../../models/operations/getprojectsanalytics.md)                               | :heavy_minus_sign: | N/A         |
| `speedInsights`                        | [operations.GetProjectsSpeedInsights](../../models/operations/getprojectsspeedinsights.md)                       | :heavy_minus_sign: | N/A         |
| `autoExposeSystemEnvs`                 | _boolean_                                                                                                        | :heavy_minus_sign: | N/A         |
| `autoAssignCustomDomains`              | _boolean_                                                                                                        | :heavy_minus_sign: | N/A         |
| `autoAssignCustomDomainsUpdatedBy`     | _string_                                                                                                         | :heavy_minus_sign: | N/A         |
| `buildCommand`                         | _string_                                                                                                         | :heavy_minus_sign: | N/A         |
| `commandForIgnoringBuildStep`          | _string_                                                                                                         | :heavy_minus_sign: | N/A         |
| `connectConfigurationId`               | _string_                                                                                                         | :heavy_minus_sign: | N/A         |
| `connectBuildsEnabled`                 | _boolean_                                                                                                        | :heavy_minus_sign: | N/A         |
| `createdAt`                            | _number_                                                                                                         | :heavy_minus_sign: | N/A         |
| `customerSupportCodeVisibility`        | _boolean_                                                                                                        | :heavy_minus_sign: | N/A         |
| `crons`                                | [operations.GetProjectsCrons](../../models/operations/getprojectscrons.md)                                       | :heavy_minus_sign: | N/A         |
| `dataCache`                            | [operations.GetProjectsDataCache](../../models/operations/getprojectsdatacache.md)                               | :heavy_minus_sign: | N/A         |
| `deploymentExpiration`                 | [operations.GetProjectsDeploymentExpiration](../../models/operations/getprojectsdeploymentexpiration.md)         | :heavy_minus_sign: | N/A         |
| `devCommand`                           | _string_                                                                                                         | :heavy_minus_sign: | N/A         |
| `directoryListing`                     | _boolean_                                                                                                        | :heavy_check_mark: | N/A         |
| `installCommand`                       | _string_                                                                                                         | :heavy_minus_sign: | N/A         |
| `env`                                  | [operations.GetProjectsEnv](../../models/operations/getprojectsenv.md)[]                                         | :heavy_minus_sign: | N/A         |
| `framework`                            | [operations.GetProjectsFramework](../../models/operations/getprojectsframework.md)                               | :heavy_minus_sign: | N/A         |
| `gitForkProtection`                    | _boolean_                                                                                                        | :heavy_minus_sign: | N/A         |
| `gitLFS`                               | _boolean_                                                                                                        | :heavy_minus_sign: | N/A         |
| `id`                                   | _string_                                                                                                         | :heavy_check_mark: | N/A         |
| `latestDeployments`                    | [operations.GetProjectsLatestDeployments](../../models/operations/getprojectslatestdeployments.md)[]             | :heavy_minus_sign: | N/A         |
| `link`                                 | _operations.GetProjectsLink_                                                                                     | :heavy_minus_sign: | N/A         |
| `name`                                 | _string_                                                                                                         | :heavy_check_mark: | N/A         |
| `nodeVersion`                          | [operations.GetProjectsNodeVersion](../../models/operations/getprojectsnodeversion.md)                           | :heavy_check_mark: | N/A         |
| `optionsAllowlist`                     | [operations.GetProjectsOptionsAllowlist](../../models/operations/getprojectsoptionsallowlist.md)                 | :heavy_minus_sign: | N/A         |
| `outputDirectory`                      | _string_                                                                                                         | :heavy_minus_sign: | N/A         |
| `passiveConnectConfigurationId`        | _string_                                                                                                         | :heavy_minus_sign: | N/A         |
| `passwordProtection`                   | [operations.GetProjectsPasswordProtection](../../models/operations/getprojectspasswordprotection.md)             | :heavy_minus_sign: | N/A         |
| `productionDeploymentsFastLane`        | _boolean_                                                                                                        | :heavy_minus_sign: | N/A         |
| `publicSource`                         | _boolean_                                                                                                        | :heavy_minus_sign: | N/A         |
| `rootDirectory`                        | _string_                                                                                                         | :heavy_minus_sign: | N/A         |
| `serverlessFunctionRegion`             | _string_                                                                                                         | :heavy_minus_sign: | N/A         |
| `serverlessFunctionZeroConfigFailover` | _boolean_                                                                                                        | :heavy_minus_sign: | N/A         |
| `skewProtectionBoundaryAt`             | _number_                                                                                                         | :heavy_minus_sign: | N/A         |
| `skewProtectionMaxAge`                 | _number_                                                                                                         | :heavy_minus_sign: | N/A         |
| `skipGitConnectDuringLink`             | _boolean_                                                                                                        | :heavy_minus_sign: | N/A         |
| `sourceFilesOutsideRootDirectory`      | _boolean_                                                                                                        | :heavy_minus_sign: | N/A         |
| `enableAffectedProjectsDeployments`    | _boolean_                                                                                                        | :heavy_minus_sign: | N/A         |
| `ssoProtection`                        | [operations.GetProjectsSsoProtection](../../models/operations/getprojectsssoprotection.md)                       | :heavy_minus_sign: | N/A         |
| `targets`                              | Record<string, [operations.GetProjectsTargets](../../models/operations/getprojectstargets.md)>                   | :heavy_minus_sign: | N/A         |
| `transferCompletedAt`                  | _number_                                                                                                         | :heavy_minus_sign: | N/A         |
| `transferStartedAt`                    | _number_                                                                                                         | :heavy_minus_sign: | N/A         |
| `transferToAccountId`                  | _string_                                                                                                         | :heavy_minus_sign: | N/A         |
| `transferredFromAccountId`             | _string_                                                                                                         | :heavy_minus_sign: | N/A         |
| `updatedAt`                            | _number_                                                                                                         | :heavy_minus_sign: | N/A         |
| `live`                                 | _boolean_                                                                                                        | :heavy_minus_sign: | N/A         |
| `enablePreviewFeedback`                | _boolean_                                                                                                        | :heavy_minus_sign: | N/A         |
| `enableProductionFeedback`             | _boolean_                                                                                                        | :heavy_minus_sign: | N/A         |
| `permissions`                          | [operations.GetProjectsPermissions](../../models/operations/getprojectspermissions.md)                           | :heavy_minus_sign: | N/A         |
| `lastRollbackTarget`                   | [operations.GetProjectsLastRollbackTarget](../../models/operations/getprojectslastrollbacktarget.md)             | :heavy_minus_sign: | N/A         |
| `lastAliasRequest`                     | [operations.GetProjectsLastAliasRequest](../../models/operations/getprojectslastaliasrequest.md)                 | :heavy_minus_sign: | N/A         |
| `hasFloatingAliases`                   | _boolean_                                                                                                        | :heavy_minus_sign: | N/A         |
| `protectionBypass`                     | Record<string, [operations.GetProjectsProtectionBypass](../../models/operations/getprojectsprotectionbypass.md)> | :heavy_minus_sign: | N/A         |
| `hasActiveBranches`                    | _boolean_                                                                                                        | :heavy_minus_sign: | N/A         |
| `trustedIps`                           | _operations.GetProjectsTrustedIps_                                                                               | :heavy_minus_sign: | N/A         |
| `gitComments`                          | [operations.GetProjectsGitComments](../../models/operations/getprojectsgitcomments.md)                           | :heavy_minus_sign: | N/A         |
| `paused`                               | _boolean_                                                                                                        | :heavy_minus_sign: | N/A         |
| `concurrencyBucketName`                | _string_                                                                                                         | :heavy_minus_sign: | N/A         |
| `webAnalytics`                         | [operations.GetProjectsWebAnalytics](../../models/operations/getprojectswebanalytics.md)                         | :heavy_minus_sign: | N/A         |
| `security`                             | [operations.GetProjectsSecurity](../../models/operations/getprojectssecurity.md)                                 | :heavy_minus_sign: | N/A         |
| `oidcTokenConfig`                      | [operations.GetProjectsOidcTokenConfig](../../models/operations/getprojectsoidctokenconfig.md)                   | :heavy_minus_sign: | N/A         |
| `tier`                                 | [operations.GetProjectsTier](../../models/operations/getprojectstier.md)                                         | :heavy_minus_sign: | N/A         |
