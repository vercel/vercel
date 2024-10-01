# Srv

## Example Usage

```typescript
import { Srv } from "@vercel/sdk/models/operations/updaterecord.js";

let value: Srv = {
  target: "example2.com.",
  weight: 638363,
  port: 6669,
  priority: 673010,
};
```

## Fields

| Field              | Type               | Required           | Description        | Example            |
| ------------------ | ------------------ | ------------------ | ------------------ | ------------------ |
| `target`           | *string*           | :heavy_check_mark: | N/A                | example2.com.      |
| `weight`           | *number*           | :heavy_check_mark: | N/A                |                    |
| `port`             | *number*           | :heavy_check_mark: | N/A                |                    |
| `priority`         | *number*           | :heavy_check_mark: | N/A                |                    |