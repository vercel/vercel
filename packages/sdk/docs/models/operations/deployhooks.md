# DeployHooks

## Example Usage

```typescript
import { DeployHooks } from "@vercel/sdk/models/operations";

let value: DeployHooks = {
  id: "<id>",
  name: "<value>",
  ref: "<value>",
  url: "http://acrobatic-plantation.org",
};
```

## Fields

| Field              | Type               | Required           | Description        |
| ------------------ | ------------------ | ------------------ | ------------------ |
| `createdAt`        | *number*           | :heavy_minus_sign: | N/A                |
| `id`               | *string*           | :heavy_check_mark: | N/A                |
| `name`             | *string*           | :heavy_check_mark: | N/A                |
| `ref`              | *string*           | :heavy_check_mark: | N/A                |
| `url`              | *string*           | :heavy_check_mark: | N/A                |