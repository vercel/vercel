# CreateDeploymentProjectSettings

## Example Usage

```typescript
import { CreateDeploymentProjectSettings } from '@vercel/client/models/operations';

let value: CreateDeploymentProjectSettings = {};
```

## Fields

| Field                         | Type                                                                                                 | Required           | Description |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `buildCommand`                | _string_                                                                                             | :heavy_minus_sign: | N/A         |
| `commandForIgnoringBuildStep` | _string_                                                                                             | :heavy_minus_sign: | N/A         |
| `devCommand`                  | _string_                                                                                             | :heavy_minus_sign: | N/A         |
| `framework`                   | [operations.CreateDeploymentFramework](../../models/operations/createdeploymentframework.md)         | :heavy_minus_sign: | N/A         |
| `installCommand`              | _string_                                                                                             | :heavy_minus_sign: | N/A         |
| `outputDirectory`             | _string_                                                                                             | :heavy_minus_sign: | N/A         |
| `speedInsights`               | [operations.CreateDeploymentSpeedInsights](../../models/operations/createdeploymentspeedinsights.md) | :heavy_minus_sign: | N/A         |
| `webAnalytics`                | [operations.CreateDeploymentWebAnalytics](../../models/operations/createdeploymentwebanalytics.md)   | :heavy_minus_sign: | N/A         |
