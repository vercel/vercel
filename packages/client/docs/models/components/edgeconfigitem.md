# EdgeConfigItem

The EdgeConfig.

## Example Usage

```typescript
import { EdgeConfigItem } from '@vercel/client/models/components';

let value: EdgeConfigItem = {
  key: '<key>',
  value: false,
  edgeConfigId: '<value>',
  createdAt: 755.66,
  updatedAt: 2902.48,
};
```

## Fields

| Field          | Type                             | Required           | Description |
| -------------- | -------------------------------- | ------------------ | ----------- |
| `key`          | _string_                         | :heavy_check_mark: | N/A         |
| `value`        | _components.EdgeConfigItemValue_ | :heavy_check_mark: | N/A         |
| `description`  | _string_                         | :heavy_minus_sign: | N/A         |
| `edgeConfigId` | _string_                         | :heavy_check_mark: | N/A         |
| `createdAt`    | _number_                         | :heavy_check_mark: | N/A         |
| `updatedAt`    | _number_                         | :heavy_check_mark: | N/A         |
