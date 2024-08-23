# UpdateProjectDeploymentExpiration

## Example Usage

```typescript
import { UpdateProjectDeploymentExpiration } from '@vercel/client/models/operations';

let value: UpdateProjectDeploymentExpiration = {};
```

## Fields

| Field                      | Type     | Required           | Description |
| -------------------------- | -------- | ------------------ | ----------- |
| `expirationDays`           | _number_ | :heavy_minus_sign: | N/A         |
| `expirationDaysProduction` | _number_ | :heavy_minus_sign: | N/A         |
| `expirationDaysCanceled`   | _number_ | :heavy_minus_sign: | N/A         |
| `expirationDaysErrored`    | _number_ | :heavy_minus_sign: | N/A         |
| `deploymentsToKeep`        | _number_ | :heavy_minus_sign: | N/A         |
