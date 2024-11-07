# Srv

## Example Usage

```typescript
import { Srv } from "@vercel/sdk/models/operations/updaterecord.js";

let value: Srv = {
  target: "example2.com.",
  weight: 688649,
  port: 2782,
  priority: 514480,
};
```

## Fields

| Field              | Type               | Required           | Description        | Example            |
| ------------------ | ------------------ | ------------------ | ------------------ | ------------------ |
| `target`           | *string*           | :heavy_check_mark: | N/A                | example2.com.      |
| `weight`           | *number*           | :heavy_check_mark: | N/A                |                    |
| `port`             | *number*           | :heavy_check_mark: | N/A                |                    |
| `priority`         | *number*           | :heavy_check_mark: | N/A                |                    |