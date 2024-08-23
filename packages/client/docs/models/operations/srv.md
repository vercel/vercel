# Srv

## Example Usage

```typescript
import { Srv } from '@vercel/client/models/operations';

let value: Srv = {
  target: 'example2.com.',
  weight: 316220,
  port: 110477,
  priority: 833316,
};
```

## Fields

| Field      | Type     | Required           | Description | Example       |
| ---------- | -------- | ------------------ | ----------- | ------------- |
| `target`   | _string_ | :heavy_check_mark: | N/A         | example2.com. |
| `weight`   | _number_ | :heavy_check_mark: | N/A         |               |
| `port`     | _number_ | :heavy_check_mark: | N/A         |               |
| `priority` | _number_ | :heavy_check_mark: | N/A         |               |
