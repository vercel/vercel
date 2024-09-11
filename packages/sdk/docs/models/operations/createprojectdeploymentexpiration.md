# CreateProjectDeploymentExpiration

## Example Usage

```typescript
import { CreateProjectDeploymentExpiration } from "@vercel/sdk/models/operations";

let value: CreateProjectDeploymentExpiration = {};
```

## Fields

| Field                      | Type                       | Required                   | Description                |
| -------------------------- | -------------------------- | -------------------------- | -------------------------- |
| `expirationDays`           | *number*                   | :heavy_minus_sign:         | N/A                        |
| `expirationDaysProduction` | *number*                   | :heavy_minus_sign:         | N/A                        |
| `expirationDaysCanceled`   | *number*                   | :heavy_minus_sign:         | N/A                        |
| `expirationDaysErrored`    | *number*                   | :heavy_minus_sign:         | N/A                        |
| `deploymentsToKeep`        | *number*                   | :heavy_minus_sign:         | N/A                        |