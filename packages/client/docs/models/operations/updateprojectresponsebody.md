# UpdateProjectResponseBody

The project was successfully updated

## Example Usage

```typescript
import { UpdateProjectResponseBody } from '@vercel/client/models/operations';

let value: UpdateProjectResponseBody = {
  accountId: '<value>',
  crons: {
    enabledAt: 2327.44,
    disabledAt: 2371.73,
    updatedAt: 6144.65,
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
      createdAt: 8395.13,
      createdIn: '<value>',
      creator: {
        email: 'Joyce.Armstrong@gmail.com',
        uid: '<value>',
        username: 'Mabel.Bernhard',
      },
      deploymentHostname: '<value>',
      name: '<value>',
      id: '<id>',
      plan: 'pro',
      private: false,
      readyState: 'ERROR',
      type: 'LAMBDAS',
      url: 'https://exotic-saving.com',
      userId: '<value>',
      previewCommentsEnabled: false,
    },
  ],
  name: '<value>',
  nodeVersion: '16.x',
  targets: {
    key: {
      createdAt: 120.36,
      createdIn: '<value>',
      creator: {
        email: 'Bettie.Wunsch@yahoo.com',
        uid: '<value>',
        username: 'Webster.Hirthe40',
      },
      deploymentHostname: '<value>',
      name: '<value>',
      id: '<id>',
      plan: 'pro',
      private: false,
      readyState: 'BUILDING',
      type: 'LAMBDAS',
      url: 'https://portly-silver.info',
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
| `analytics`                            | [operations.UpdateProjectAnalytics](../../models/operations/updateprojectanalytics.md)                               | :heavy_minus_sign: | N/A         |
| `speedInsights`                        | [operations.UpdateProjectSpeedInsights](../../models/operations/updateprojectspeedinsights.md)                       | :heavy_minus_sign: | N/A         |
| `autoExposeSystemEnvs`                 | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `autoAssignCustomDomains`              | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `autoAssignCustomDomainsUpdatedBy`     | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `buildCommand`                         | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `commandForIgnoringBuildStep`          | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `connectConfigurationId`               | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `connectBuildsEnabled`                 | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `createdAt`                            | _number_                                                                                                             | :heavy_minus_sign: | N/A         |
| `customerSupportCodeVisibility`        | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `crons`                                | [operations.UpdateProjectCrons](../../models/operations/updateprojectcrons.md)                                       | :heavy_minus_sign: | N/A         |
| `dataCache`                            | [operations.UpdateProjectDataCache](../../models/operations/updateprojectdatacache.md)                               | :heavy_minus_sign: | N/A         |
| `deploymentExpiration`                 | [operations.UpdateProjectDeploymentExpiration](../../models/operations/updateprojectdeploymentexpiration.md)         | :heavy_minus_sign: | N/A         |
| `devCommand`                           | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `directoryListing`                     | _boolean_                                                                                                            | :heavy_check_mark: | N/A         |
| `installCommand`                       | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `env`                                  | [operations.UpdateProjectEnv](../../models/operations/updateprojectenv.md)[]                                         | :heavy_minus_sign: | N/A         |
| `framework`                            | [operations.UpdateProjectProjectsFramework](../../models/operations/updateprojectprojectsframework.md)               | :heavy_minus_sign: | N/A         |
| `gitForkProtection`                    | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `gitLFS`                               | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `id`                                   | _string_                                                                                                             | :heavy_check_mark: | N/A         |
| `latestDeployments`                    | [operations.UpdateProjectLatestDeployments](../../models/operations/updateprojectlatestdeployments.md)[]             | :heavy_minus_sign: | N/A         |
| `link`                                 | _operations.UpdateProjectLink_                                                                                       | :heavy_minus_sign: | N/A         |
| `name`                                 | _string_                                                                                                             | :heavy_check_mark: | N/A         |
| `nodeVersion`                          | [operations.UpdateProjectProjectsNodeVersion](../../models/operations/updateprojectprojectsnodeversion.md)           | :heavy_check_mark: | N/A         |
| `optionsAllowlist`                     | [operations.UpdateProjectOptionsAllowlist](../../models/operations/updateprojectoptionsallowlist.md)                 | :heavy_minus_sign: | N/A         |
| `outputDirectory`                      | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `passiveConnectConfigurationId`        | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `passwordProtection`                   | [operations.UpdateProjectPasswordProtection](../../models/operations/updateprojectpasswordprotection.md)             | :heavy_minus_sign: | N/A         |
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
| `ssoProtection`                        | [operations.UpdateProjectSsoProtection](../../models/operations/updateprojectssoprotection.md)                       | :heavy_minus_sign: | N/A         |
| `targets`                              | Record<string, [operations.UpdateProjectTargets](../../models/operations/updateprojecttargets.md)>                   | :heavy_minus_sign: | N/A         |
| `transferCompletedAt`                  | _number_                                                                                                             | :heavy_minus_sign: | N/A         |
| `transferStartedAt`                    | _number_                                                                                                             | :heavy_minus_sign: | N/A         |
| `transferToAccountId`                  | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `transferredFromAccountId`             | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `updatedAt`                            | _number_                                                                                                             | :heavy_minus_sign: | N/A         |
| `live`                                 | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `enablePreviewFeedback`                | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `enableProductionFeedback`             | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `permissions`                          | [operations.UpdateProjectPermissions](../../models/operations/updateprojectpermissions.md)                           | :heavy_minus_sign: | N/A         |
| `lastRollbackTarget`                   | [operations.UpdateProjectLastRollbackTarget](../../models/operations/updateprojectlastrollbacktarget.md)             | :heavy_minus_sign: | N/A         |
| `lastAliasRequest`                     | [operations.UpdateProjectLastAliasRequest](../../models/operations/updateprojectlastaliasrequest.md)                 | :heavy_minus_sign: | N/A         |
| `hasFloatingAliases`                   | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `protectionBypass`                     | Record<string, [operations.UpdateProjectProtectionBypass](../../models/operations/updateprojectprotectionbypass.md)> | :heavy_minus_sign: | N/A         |
| `hasActiveBranches`                    | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `trustedIps`                           | _operations.UpdateProjectTrustedIps_                                                                                 | :heavy_minus_sign: | N/A         |
| `gitComments`                          | [operations.UpdateProjectGitComments](../../models/operations/updateprojectgitcomments.md)                           | :heavy_minus_sign: | N/A         |
| `paused`                               | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `concurrencyBucketName`                | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `webAnalytics`                         | [operations.UpdateProjectWebAnalytics](../../models/operations/updateprojectwebanalytics.md)                         | :heavy_minus_sign: | N/A         |
| `security`                             | [operations.UpdateProjectSecurity](../../models/operations/updateprojectsecurity.md)                                 | :heavy_minus_sign: | N/A         |
| `oidcTokenConfig`                      | [operations.UpdateProjectProjectsOidcTokenConfig](../../models/operations/updateprojectprojectsoidctokenconfig.md)   | :heavy_minus_sign: | N/A         |
| `tier`                                 | [operations.UpdateProjectTier](../../models/operations/updateprojecttier.md)                                         | :heavy_minus_sign: | N/A         |
