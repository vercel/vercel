# GetDeploymentsProjectSettings

The project settings which was used for this deployment

## Example Usage

```typescript
import { GetDeploymentsProjectSettings } from '@vercel/client/models/operations';

let value: GetDeploymentsProjectSettings = {};
```

## Fields

| Field                             | Type                                                                                             | Required           | Description    |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------ | -------------- |
| `framework`                       | [operations.GetDeploymentsFramework](../../models/operations/getdeploymentsframework.md)         | :heavy_minus_sign: | N/A            |
| `gitForkProtection`               | _boolean_                                                                                        | :heavy_minus_sign: | N/A            |
| `customerSupportCodeVisibility`   | _boolean_                                                                                        | :heavy_minus_sign: | N/A            |
| `gitLFS`                          | _boolean_                                                                                        | :heavy_minus_sign: | N/A            |
| `devCommand`                      | _string_                                                                                         | :heavy_minus_sign: | N/A            |
| `installCommand`                  | _string_                                                                                         | :heavy_minus_sign: | N/A            |
| `buildCommand`                    | _string_                                                                                         | :heavy_minus_sign: | N/A            |
| `nodeVersion`                     | [operations.GetDeploymentsNodeVersion](../../models/operations/getdeploymentsnodeversion.md)     | :heavy_minus_sign: | N/A            |
| `outputDirectory`                 | _string_                                                                                         | :heavy_minus_sign: | N/A            |
| `publicSource`                    | _boolean_                                                                                        | :heavy_minus_sign: | N/A            |
| `rootDirectory`                   | _string_                                                                                         | :heavy_minus_sign: | N/A            |
| `serverlessFunctionRegion`        | _string_                                                                                         | :heavy_minus_sign: | N/A            |
| `sourceFilesOutsideRootDirectory` | _boolean_                                                                                        | :heavy_minus_sign: | N/A            |
| `commandForIgnoringBuildStep`     | _string_                                                                                         | :heavy_minus_sign: | N/A            |
| `createdAt`                       | _number_                                                                                         | :heavy_minus_sign: | N/A            |
| `speedInsights`                   | [operations.GetDeploymentsSpeedInsights](../../models/operations/getdeploymentsspeedinsights.md) | :heavy_minus_sign: | N/A            |
| `webAnalytics`                    | [operations.GetDeploymentsWebAnalytics](../../models/operations/getdeploymentswebanalytics.md)   | :heavy_minus_sign: | N/A            |
| `skipGitConnectDuringLink`        | _boolean_                                                                                        | :heavy_minus_sign: | N/A            |
| `gitComments`                     | [operations.GetDeploymentsGitComments](../../models/operations/getdeploymentsgitcomments.md)     | :heavy_minus_sign: | Since June '23 |
