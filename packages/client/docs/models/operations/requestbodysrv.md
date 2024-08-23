# RequestBodySrv

## Example Usage

```typescript
import { RequestBodySrv } from '@vercel/client/models/operations';

let value: RequestBodySrv = {
  priority: 10,
  weight: 10,
  port: 5000,
  target: 'host.example.com',
};
```

## Fields

| Field      | Type     | Required           | Description | Example          |
| ---------- | -------- | ------------------ | ----------- | ---------------- |
| `priority` | _number_ | :heavy_check_mark: | N/A         | 10               |
| `weight`   | _number_ | :heavy_check_mark: | N/A         | 10               |
| `port`     | _number_ | :heavy_check_mark: | N/A         | 5000             |
| `target`   | _string_ | :heavy_check_mark: | N/A         | host.example.com |
