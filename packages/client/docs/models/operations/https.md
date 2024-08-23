# Https

## Example Usage

```typescript
import { Https } from '@vercel/client/models/operations';

let value: Https = {
  priority: 405036,
  target: 'example2.com.',
};
```

## Fields

| Field      | Type     | Required           | Description | Example       |
| ---------- | -------- | ------------------ | ----------- | ------------- |
| `priority` | _number_ | :heavy_check_mark: | N/A         |               |
| `target`   | _string_ | :heavy_check_mark: | N/A         | example2.com. |
| `params`   | _string_ | :heavy_minus_sign: | N/A         |               |
