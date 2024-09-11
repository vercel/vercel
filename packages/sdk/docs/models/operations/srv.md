# Srv

## Example Usage

```typescript
import { Srv } from "@vercel/sdk/models/operations";

let value: Srv = {
  target: "example2.com.",
  weight: 316220,
  port: 110477,
  priority: 833316,
};
```

## Fields

| Field              | Type               | Required           | Description        | Example            |
| ------------------ | ------------------ | ------------------ | ------------------ | ------------------ |
| `target`           | *string*           | :heavy_check_mark: | N/A                | example2.com.      |
| `weight`           | *number*           | :heavy_check_mark: | N/A                |                    |
| `port`             | *number*           | :heavy_check_mark: | N/A                |                    |
| `priority`         | *number*           | :heavy_check_mark: | N/A                |                    |