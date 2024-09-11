# RequestBodySrv

## Example Usage

```typescript
import { RequestBodySrv } from "@vercel/sdk/models/operations";

let value: RequestBodySrv = {
  priority: 10,
  weight: 10,
  port: 5000,
  target: "host.example.com",
};
```

## Fields

| Field              | Type               | Required           | Description        | Example            |
| ------------------ | ------------------ | ------------------ | ------------------ | ------------------ |
| `priority`         | *number*           | :heavy_check_mark: | N/A                | 10                 |
| `weight`           | *number*           | :heavy_check_mark: | N/A                | 10                 |
| `port`             | *number*           | :heavy_check_mark: | N/A                | 5000               |
| `target`           | *string*           | :heavy_check_mark: | N/A                | host.example.com   |