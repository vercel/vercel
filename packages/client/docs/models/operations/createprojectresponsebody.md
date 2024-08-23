# CreateProjectResponseBody

The project was successfuly created

## Example Usage

```typescript
import { CreateProjectResponseBody } from '@vercel/client/models/operations';

let value: CreateProjectResponseBody = {
  accountId: '<value>',
  crons: {
    enabledAt: 896.03,
    disabledAt: 6774.12,
    updatedAt: 6720.48,
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
      createdAt: 8104.24,
      createdIn: '<value>',
      creator: {
        email: 'Hollis_Johnston82@gmail.com',
        uid: '<value>',
        username: 'Sabina.Hoeger27',
      },
      deploymentHostname: '<value>',
      name: '<value>',
      id: '<id>',
      plan: 'pro',
      private: false,
      readyState: 'BUILDING',
      type: 'LAMBDAS',
      url: 'https://aware-jackal.biz',
      userId: '<value>',
      previewCommentsEnabled: false,
    },
  ],
  name: '<value>',
  nodeVersion: '14.x',
  targets: {
    key: {
      createdAt: 2621.18,
      createdIn: '<value>',
      creator: {
        email: 'Jacky.Leffler69@yahoo.com',
        uid: '<value>',
        username: 'Royce.Graham',
      },
      deploymentHostname: '<value>',
      name: '<value>',
      id: '<id>',
      plan: 'hobby',
      private: false,
      readyState: 'ERROR',
      type: 'LAMBDAS',
      url: 'https://spiffy-blackness.com',
      userId: '<value>',
      previewCommentsEnabled: false,
    },
  },
};
```

## Fields

| Field                                  | Type                                                                                                                 | Required           | Description |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `accountId`                            | _string_                                                                                                             | :heavy_check_mark: | N/A         |
| `analytics`                            | [operations.CreateProjectAnalytics](../../models/operations/createprojectanalytics.md)                               | :heavy_minus_sign: | N/A         |
| `speedInsights`                        | [operations.CreateProjectSpeedInsights](../../models/operations/createprojectspeedinsights.md)                       | :heavy_minus_sign: | N/A         |
| `autoExposeSystemEnvs`                 | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `autoAssignCustomDomains`              | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `autoAssignCustomDomainsUpdatedBy`     | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `buildCommand`                         | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `commandForIgnoringBuildStep`          | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `connectConfigurationId`               | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `connectBuildsEnabled`                 | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `createdAt`                            | _number_                                                                                                             | :heavy_minus_sign: | N/A         |
| `customerSupportCodeVisibility`        | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `crons`                                | [operations.CreateProjectCrons](../../models/operations/createprojectcrons.md)                                       | :heavy_minus_sign: | N/A         |
| `dataCache`                            | [operations.CreateProjectDataCache](../../models/operations/createprojectdatacache.md)                               | :heavy_minus_sign: | N/A         |
| `deploymentExpiration`                 | [operations.CreateProjectDeploymentExpiration](../../models/operations/createprojectdeploymentexpiration.md)         | :heavy_minus_sign: | N/A         |
| `devCommand`                           | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `directoryListing`                     | _boolean_                                                                                                            | :heavy_check_mark: | N/A         |
| `installCommand`                       | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `env`                                  | [operations.CreateProjectEnv](../../models/operations/createprojectenv.md)[]                                         | :heavy_minus_sign: | N/A         |
| `framework`                            | [operations.CreateProjectProjectsFramework](../../models/operations/createprojectprojectsframework.md)               | :heavy_minus_sign: | N/A         |
| `gitForkProtection`                    | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `gitLFS`                               | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `id`                                   | _string_                                                                                                             | :heavy_check_mark: | N/A         |
| `latestDeployments`                    | [operations.CreateProjectLatestDeployments](../../models/operations/createprojectlatestdeployments.md)[]             | :heavy_minus_sign: | N/A         |
| `link`                                 | _operations.CreateProjectLink_                                                                                       | :heavy_minus_sign: | N/A         |
| `name`                                 | _string_                                                                                                             | :heavy_check_mark: | N/A         |
| `nodeVersion`                          | [operations.CreateProjectNodeVersion](../../models/operations/createprojectnodeversion.md)                           | :heavy_check_mark: | N/A         |
| `optionsAllowlist`                     | [operations.CreateProjectOptionsAllowlist](../../models/operations/createprojectoptionsallowlist.md)                 | :heavy_minus_sign: | N/A         |
| `outputDirectory`                      | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `passiveConnectConfigurationId`        | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `passwordProtection`                   | [operations.CreateProjectPasswordProtection](../../models/operations/createprojectpasswordprotection.md)             | :heavy_minus_sign: | N/A         |
| `productionDeploymentsFastLane`        | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `publicSource`                         | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `rootDirectory`                        | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `serverlessFunctionRegion`             | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `serverlessFunctionZeroConfigFailover` | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `skewProtectionBoundaryAt`             | _number_                                                                                                             | :heavy_minus_sign: | N/A         |
| `skewProtectionMaxAge`                 | _number_                                                                                                             | :heavy_minus_sign: | N/A         |
| `skipGitConnectDuringLink`             | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `sourceFilesOutsideRootDirectory`      | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `enableAffectedProjectsDeployments`    | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `ssoProtection`                        | [operations.CreateProjectSsoProtection](../../models/operations/createprojectssoprotection.md)                       | :heavy_minus_sign: | N/A         |
| `targets`                              | Record<string, [operations.CreateProjectTargets](../../models/operations/createprojecttargets.md)>                   | :heavy_minus_sign: | N/A         |
| `transferCompletedAt`                  | _number_                                                                                                             | :heavy_minus_sign: | N/A         |
| `transferStartedAt`                    | _number_                                                                                                             | :heavy_minus_sign: | N/A         |
| `transferToAccountId`                  | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `transferredFromAccountId`             | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `updatedAt`                            | _number_                                                                                                             | :heavy_minus_sign: | N/A         |
| `live`                                 | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `enablePreviewFeedback`                | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `enableProductionFeedback`             | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `permissions`                          | [operations.CreateProjectPermissions](../../models/operations/createprojectpermissions.md)                           | :heavy_minus_sign: | N/A         |
| `lastRollbackTarget`                   | [operations.CreateProjectLastRollbackTarget](../../models/operations/createprojectlastrollbacktarget.md)             | :heavy_minus_sign: | N/A         |
| `lastAliasRequest`                     | [operations.CreateProjectLastAliasRequest](../../models/operations/createprojectlastaliasrequest.md)                 | :heavy_minus_sign: | N/A         |
| `hasFloatingAliases`                   | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `protectionBypass`                     | Record<string, [operations.CreateProjectProtectionBypass](../../models/operations/createprojectprotectionbypass.md)> | :heavy_minus_sign: | N/A         |
| `hasActiveBranches`                    | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `trustedIps`                           | _operations.CreateProjectTrustedIps_                                                                                 | :heavy_minus_sign: | N/A         |
| `gitComments`                          | [operations.CreateProjectGitComments](../../models/operations/createprojectgitcomments.md)                           | :heavy_minus_sign: | N/A         |
| `paused`                               | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `concurrencyBucketName`                | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `webAnalytics`                         | [operations.CreateProjectWebAnalytics](../../models/operations/createprojectwebanalytics.md)                         | :heavy_minus_sign: | N/A         |
| `security`                             | [operations.CreateProjectSecurity](../../models/operations/createprojectsecurity.md)                                 | :heavy_minus_sign: | N/A         |
| `oidcTokenConfig`                      | [operations.CreateProjectOidcTokenConfig](../../models/operations/createprojectoidctokenconfig.md)                   | :heavy_minus_sign: | N/A         |
| `tier`                                 | [operations.CreateProjectTier](../../models/operations/createprojecttier.md)                                         | :heavy_minus_sign: | N/A         |
