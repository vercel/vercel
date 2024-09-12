# CreateDeploymentSpeedInsights

## Example Usage

```typescript
import { CreateDeploymentSpeedInsights } from "@vercel/sdk/models/operations";

let value: CreateDeploymentSpeedInsights = {
  id: "<id>",
};
```

## Fields

| Field              | Type               | Required           | Description        |
| ------------------ | ------------------ | ------------------ | ------------------ |
| `id`               | *string*           | :heavy_check_mark: | N/A                |
| `enabledAt`        | *number*           | :heavy_minus_sign: | N/A                |
| `disabledAt`       | *number*           | :heavy_minus_sign: | N/A                |
| `canceledAt`       | *number*           | :heavy_minus_sign: | N/A                |
| `hasData`          | *boolean*          | :heavy_minus_sign: | N/A                |
| `paidAt`           | *number*           | :heavy_minus_sign: | N/A                |