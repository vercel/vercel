# CreateProjectSpeedInsights

## Example Usage

```typescript
import { CreateProjectSpeedInsights } from '@vercel/client/models/operations';

let value: CreateProjectSpeedInsights = {
  id: '<id>',
};
```

## Fields

| Field        | Type      | Required           | Description |
| ------------ | --------- | ------------------ | ----------- |
| `id`         | _string_  | :heavy_check_mark: | N/A         |
| `enabledAt`  | _number_  | :heavy_minus_sign: | N/A         |
| `disabledAt` | _number_  | :heavy_minus_sign: | N/A         |
| `canceledAt` | _number_  | :heavy_minus_sign: | N/A         |
| `hasData`    | _boolean_ | :heavy_minus_sign: | N/A         |
| `paidAt`     | _number_  | :heavy_minus_sign: | N/A         |
