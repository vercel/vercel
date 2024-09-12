# GetProjectsDeploymentExpiration

## Example Usage

```typescript
import { GetProjectsDeploymentExpiration } from "@vercel/sdk/models/operations";

let value: GetProjectsDeploymentExpiration = {};
```

## Fields

| Field                      | Type                       | Required                   | Description                |
| -------------------------- | -------------------------- | -------------------------- | -------------------------- |
| `expirationDays`           | *number*                   | :heavy_minus_sign:         | N/A                        |
| `expirationDaysProduction` | *number*                   | :heavy_minus_sign:         | N/A                        |
| `expirationDaysCanceled`   | *number*                   | :heavy_minus_sign:         | N/A                        |
| `expirationDaysErrored`    | *number*                   | :heavy_minus_sign:         | N/A                        |
| `deploymentsToKeep`        | *number*                   | :heavy_minus_sign:         | N/A                        |