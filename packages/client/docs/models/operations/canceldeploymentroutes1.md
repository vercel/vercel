# CancelDeploymentRoutes1

## Example Usage

```typescript
import { CancelDeploymentRoutes1 } from '@vercel/client/models/operations';

let value: CancelDeploymentRoutes1 = {
  src: '<value>',
};
```

## Fields

| Field              | Type                                                               | Required           | Description                                                                                           |
| ------------------ | ------------------------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------- |
| `src`              | _string_                                                           | :heavy_check_mark: | N/A                                                                                                   |
| `dest`             | _string_                                                           | :heavy_minus_sign: | N/A                                                                                                   |
| `headers`          | Record<string, _string_>                                           | :heavy_minus_sign: | N/A                                                                                                   |
| `methods`          | _string_[]                                                         | :heavy_minus_sign: | N/A                                                                                                   |
| `continue`         | _boolean_                                                          | :heavy_minus_sign: | N/A                                                                                                   |
| `override`         | _boolean_                                                          | :heavy_minus_sign: | N/A                                                                                                   |
| `caseSensitive`    | _boolean_                                                          | :heavy_minus_sign: | N/A                                                                                                   |
| `check`            | _boolean_                                                          | :heavy_minus_sign: | N/A                                                                                                   |
| `important`        | _boolean_                                                          | :heavy_minus_sign: | N/A                                                                                                   |
| `status`           | _number_                                                           | :heavy_minus_sign: | N/A                                                                                                   |
| `has`              | _operations.CancelDeploymentRoutesHas_[]                           | :heavy_minus_sign: | N/A                                                                                                   |
| `missing`          | _operations.CancelDeploymentRoutesMissing_[]                       | :heavy_minus_sign: | N/A                                                                                                   |
| `locale`           | [operations.RoutesLocale](../../models/operations/routeslocale.md) | :heavy_minus_sign: | N/A                                                                                                   |
| `middlewarePath`   | _string_                                                           | :heavy_minus_sign: | A middleware key within the `output` key under the build result. Overrides a `middleware` definition. |
| `middlewareRawSrc` | _string_[]                                                         | :heavy_minus_sign: | The original middleware matchers.                                                                     |
| `middleware`       | _number_                                                           | :heavy_minus_sign: | A middleware index in the `middleware` key under the build result                                     |
