# EdgeConfigItem

The EdgeConfig.

## Example Usage

```typescript
import { EdgeConfigItem } from "@vercel/sdk/models/components/edgeconfigitem.js";

let value: EdgeConfigItem = {
  key: "<key>",
  value: "<value>",
  edgeConfigId: "<value>",
  createdAt: 4638.95,
  updatedAt: 6839.80,
};
```

## Fields

| Field                            | Type                             | Required                         | Description                      |
| -------------------------------- | -------------------------------- | -------------------------------- | -------------------------------- |
| `key`                            | *string*                         | :heavy_check_mark:               | N/A                              |
| `value`                          | *components.EdgeConfigItemValue* | :heavy_check_mark:               | N/A                              |
| `description`                    | *string*                         | :heavy_minus_sign:               | N/A                              |
| `edgeConfigId`                   | *string*                         | :heavy_check_mark:               | N/A                              |
| `createdAt`                      | *number*                         | :heavy_check_mark:               | N/A                              |
| `updatedAt`                      | *number*                         | :heavy_check_mark:               | N/A                              |