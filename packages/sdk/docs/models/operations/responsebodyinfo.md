# ResponseBodyInfo

## Example Usage

```typescript
import { ResponseBodyInfo } from "@vercel/sdk/models/operations";

let value: ResponseBodyInfo = {
  type: "<value>",
  name: "<value>",
};
```

## Fields

| Field              | Type               | Required           | Description        |
| ------------------ | ------------------ | ------------------ | ------------------ |
| `type`             | *string*           | :heavy_check_mark: | N/A                |
| `name`             | *string*           | :heavy_check_mark: | N/A                |
| `entrypoint`       | *string*           | :heavy_minus_sign: | N/A                |
| `path`             | *string*           | :heavy_minus_sign: | N/A                |
| `step`             | *string*           | :heavy_minus_sign: | N/A                |
| `readyState`       | *string*           | :heavy_minus_sign: | N/A                |