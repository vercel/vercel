# Integration

## Example Usage

```typescript
import { Integration } from "@vercel/sdk/models/operations";

let value: Integration = {
  name: "<value>",
  icon: "<value>",
  category: "<value>",
  isLegacy: false,
};
```

## Fields

| Field                 | Type                  | Required              | Description           |
| --------------------- | --------------------- | --------------------- | --------------------- |
| `name`                | *string*              | :heavy_check_mark:    | N/A                   |
| `icon`                | *string*              | :heavy_check_mark:    | N/A                   |
| `category`            | *string*              | :heavy_check_mark:    | N/A                   |
| `isLegacy`            | *boolean*             | :heavy_check_mark:    | N/A                   |
| `flags`               | *string*[]            | :heavy_minus_sign:    | N/A                   |
| `assignedBetaLabelAt` | *number*              | :heavy_minus_sign:    | N/A                   |