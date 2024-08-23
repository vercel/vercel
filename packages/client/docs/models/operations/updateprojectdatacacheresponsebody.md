# UpdateProjectDataCacheResponseBody

## Example Usage

```typescript
import { UpdateProjectDataCacheResponseBody } from '@vercel/client/models/operations';

let value: UpdateProjectDataCacheResponseBody = {
  accountId: '<value>',
  crons: {
    enabledAt: 6180.16,
    disabledAt: 7491.7,
    updatedAt: 4287.69,
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
      createdAt: 8784.53,
      createdIn: '<value>',
      creator: {
        email: 'Baylee56@gmail.com',
        uid: '<value>',
        username: 'Ferne_McLaughlin',
      },
      deploymentHostname: '<value>',
      name: '<value>',
      id: '<id>',
      plan: 'pro',
      private: false,
      readyState: 'QUEUED',
      type: 'LAMBDAS',
      url: 'https://private-examiner.info',
      userId: '<value>',
      previewCommentsEnabled: false,
    },
  ],
  name: '<value>',
  nodeVersion: '18.x',
  targets: {
    key: {
      createdAt: 8965.47,
      createdIn: '<value>',
      creator: {
        email: 'Fredrick_Boyle@gmail.com',
        uid: '<value>',
        username: 'Simeon_Gibson70',
      },
      deploymentHostname: '<value>',
      name: '<value>',
      id: '<id>',
      plan: 'enterprise',
      private: false,
      readyState: 'BUILDING',
      type: 'LAMBDAS',
      url: 'http://vacant-flexibility.net',
      userId: '<value>',
      previewCommentsEnabled: false,
    },
  },
};
```

## Fields

| Field                                  | Type                                                                                                                       | Required           | Description |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `accountId`                            | _string_                                                                                                                   | :heavy_check_mark: | N/A         |
| `analytics`                            | [operations.Analytics](../../models/operations/analytics.md)                                                               | :heavy_minus_sign: | N/A         |
| `speedInsights`                        | [operations.SpeedInsights](../../models/operations/speedinsights.md)                                                       | :heavy_minus_sign: | N/A         |
| `autoExposeSystemEnvs`                 | _boolean_                                                                                                                  | :heavy_minus_sign: | N/A         |
| `autoAssignCustomDomains`              | _boolean_                                                                                                                  | :heavy_minus_sign: | N/A         |
| `autoAssignCustomDomainsUpdatedBy`     | _string_                                                                                                                   | :heavy_minus_sign: | N/A         |
| `buildCommand`                         | _string_                                                                                                                   | :heavy_minus_sign: | N/A         |
| `commandForIgnoringBuildStep`          | _string_                                                                                                                   | :heavy_minus_sign: | N/A         |
| `connectConfigurationId`               | _string_                                                                                                                   | :heavy_minus_sign: | N/A         |
| `connectBuildsEnabled`                 | _boolean_                                                                                                                  | :heavy_minus_sign: | N/A         |
| `createdAt`                            | _number_                                                                                                                   | :heavy_minus_sign: | N/A         |
| `customerSupportCodeVisibility`        | _boolean_                                                                                                                  | :heavy_minus_sign: | N/A         |
| `crons`                                | [operations.Crons](../../models/operations/crons.md)                                                                       | :heavy_minus_sign: | N/A         |
| `dataCache`                            | [operations.DataCache](../../models/operations/datacache.md)                                                               | :heavy_minus_sign: | N/A         |
| `deploymentExpiration`                 | [operations.DeploymentExpiration](../../models/operations/deploymentexpiration.md)                                         | :heavy_minus_sign: | N/A         |
| `devCommand`                           | _string_                                                                                                                   | :heavy_minus_sign: | N/A         |
| `directoryListing`                     | _boolean_                                                                                                                  | :heavy_check_mark: | N/A         |
| `installCommand`                       | _string_                                                                                                                   | :heavy_minus_sign: | N/A         |
| `env`                                  | [operations.Env](../../models/operations/env.md)[]                                                                         | :heavy_minus_sign: | N/A         |
| `framework`                            | [operations.UpdateProjectDataCacheFramework](../../models/operations/updateprojectdatacacheframework.md)                   | :heavy_minus_sign: | N/A         |
| `gitForkProtection`                    | _boolean_                                                                                                                  | :heavy_minus_sign: | N/A         |
| `gitLFS`                               | _boolean_                                                                                                                  | :heavy_minus_sign: | N/A         |
| `id`                                   | _string_                                                                                                                   | :heavy_check_mark: | N/A         |
| `latestDeployments`                    | [operations.LatestDeployments](../../models/operations/latestdeployments.md)[]                                             | :heavy_minus_sign: | N/A         |
| `link`                                 | _operations.Link_                                                                                                          | :heavy_minus_sign: | N/A         |
| `name`                                 | _string_                                                                                                                   | :heavy_check_mark: | N/A         |
| `nodeVersion`                          | [operations.UpdateProjectDataCacheNodeVersion](../../models/operations/updateprojectdatacachenodeversion.md)               | :heavy_check_mark: | N/A         |
| `optionsAllowlist`                     | [operations.UpdateProjectDataCacheOptionsAllowlist](../../models/operations/updateprojectdatacacheoptionsallowlist.md)     | :heavy_minus_sign: | N/A         |
| `outputDirectory`                      | _string_                                                                                                                   | :heavy_minus_sign: | N/A         |
| `passiveConnectConfigurationId`        | _string_                                                                                                                   | :heavy_minus_sign: | N/A         |
| `passwordProtection`                   | [operations.UpdateProjectDataCachePasswordProtection](../../models/operations/updateprojectdatacachepasswordprotection.md) | :heavy_minus_sign: | N/A         |
| `productionDeploymentsFastLane`        | _boolean_                                                                                                                  | :heavy_minus_sign: | N/A         |
| `publicSource`                         | _boolean_                                                                                                                  | :heavy_minus_sign: | N/A         |
| `rootDirectory`                        | _string_                                                                                                                   | :heavy_minus_sign: | N/A         |
| `serverlessFunctionRegion`             | _string_                                                                                                                   | :heavy_minus_sign: | N/A         |
| `serverlessFunctionZeroConfigFailover` | _boolean_                                                                                                                  | :heavy_minus_sign: | N/A         |
| `skewProtectionBoundaryAt`             | _number_                                                                                                                   | :heavy_minus_sign: | N/A         |
| `skewProtectionMaxAge`                 | _number_                                                                                                                   | :heavy_minus_sign: | N/A         |
| `skipGitConnectDuringLink`             | _boolean_                                                                                                                  | :heavy_minus_sign: | N/A         |
| `sourceFilesOutsideRootDirectory`      | _boolean_                                                                                                                  | :heavy_minus_sign: | N/A         |
| `enableAffectedProjectsDeployments`    | _boolean_                                                                                                                  | :heavy_minus_sign: | N/A         |
| `ssoProtection`                        | [operations.UpdateProjectDataCacheSsoProtection](../../models/operations/updateprojectdatacachessoprotection.md)           | :heavy_minus_sign: | N/A         |
| `targets`                              | Record<string, [operations.Targets](../../models/operations/targets.md)>                                                   | :heavy_minus_sign: | N/A         |
| `transferCompletedAt`                  | _number_                                                                                                                   | :heavy_minus_sign: | N/A         |
| `transferStartedAt`                    | _number_                                                                                                                   | :heavy_minus_sign: | N/A         |
| `transferToAccountId`                  | _string_                                                                                                                   | :heavy_minus_sign: | N/A         |
| `transferredFromAccountId`             | _string_                                                                                                                   | :heavy_minus_sign: | N/A         |
| `updatedAt`                            | _number_                                                                                                                   | :heavy_minus_sign: | N/A         |
| `live`                                 | _boolean_                                                                                                                  | :heavy_minus_sign: | N/A         |
| `enablePreviewFeedback`                | _boolean_                                                                                                                  | :heavy_minus_sign: | N/A         |
| `enableProductionFeedback`             | _boolean_                                                                                                                  | :heavy_minus_sign: | N/A         |
| `permissions`                          | [operations.Permissions](../../models/operations/permissions.md)                                                           | :heavy_minus_sign: | N/A         |
| `lastRollbackTarget`                   | [operations.LastRollbackTarget](../../models/operations/lastrollbacktarget.md)                                             | :heavy_minus_sign: | N/A         |
| `lastAliasRequest`                     | [operations.LastAliasRequest](../../models/operations/lastaliasrequest.md)                                                 | :heavy_minus_sign: | N/A         |
| `hasFloatingAliases`                   | _boolean_                                                                                                                  | :heavy_minus_sign: | N/A         |
| `protectionBypass`                     | Record<string, [operations.ProtectionBypass](../../models/operations/protectionbypass.md)>                                 | :heavy_minus_sign: | N/A         |
| `hasActiveBranches`                    | _boolean_                                                                                                                  | :heavy_minus_sign: | N/A         |
| `trustedIps`                           | _operations.UpdateProjectDataCacheTrustedIps_                                                                              | :heavy_minus_sign: | N/A         |
| `gitComments`                          | [operations.GitComments](../../models/operations/gitcomments.md)                                                           | :heavy_minus_sign: | N/A         |
| `paused`                               | _boolean_                                                                                                                  | :heavy_minus_sign: | N/A         |
| `concurrencyBucketName`                | _string_                                                                                                                   | :heavy_minus_sign: | N/A         |
| `webAnalytics`                         | [operations.WebAnalytics](../../models/operations/webanalytics.md)                                                         | :heavy_minus_sign: | N/A         |
| `security`                             | [operations.Security](../../models/operations/security.md)                                                                 | :heavy_minus_sign: | N/A         |
| `oidcTokenConfig`                      | [operations.UpdateProjectDataCacheOidcTokenConfig](../../models/operations/updateprojectdatacacheoidctokenconfig.md)       | :heavy_minus_sign: | N/A         |
| `tier`                                 | [operations.Tier](../../models/operations/tier.md)                                                                         | :heavy_minus_sign: | N/A         |
