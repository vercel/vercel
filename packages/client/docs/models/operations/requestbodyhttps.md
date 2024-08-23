# RequestBodyHttps

## Example Usage

```typescript
import { RequestBodyHttps } from '@vercel/client/models/operations';

let value: RequestBodyHttps = {
  priority: 10,
  target: 'host.example.com',
  params: 'alpn=h2,h3',
};
```

## Fields

| Field      | Type     | Required           | Description | Example          |
| ---------- | -------- | ------------------ | ----------- | ---------------- |
| `priority` | _number_ | :heavy_check_mark: | N/A         | 10               |
| `target`   | _string_ | :heavy_check_mark: | N/A         | host.example.com |
| `params`   | _string_ | :heavy_minus_sign: | N/A         | alpn=h2,h3       |
