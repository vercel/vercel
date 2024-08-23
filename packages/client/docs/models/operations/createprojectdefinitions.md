# CreateProjectDefinitions

## Example Usage

```typescript
import { CreateProjectDefinitions } from '@vercel/client/models/operations';

let value: CreateProjectDefinitions = {
  host: 'vercel.com',
  path: '/api/crons/sync-something?hello=world',
  schedule: '0 0 * * *',
};
```

## Fields

| Field      | Type     | Required           | Description                                     | Example                               |
| ---------- | -------- | ------------------ | ----------------------------------------------- | ------------------------------------- |
| `host`     | _string_ | :heavy_check_mark: | The hostname that should be used.               | vercel.com                            |
| `path`     | _string_ | :heavy_check_mark: | The path that should be called for the cronjob. | /api/crons/sync-something?hello=world |
| `schedule` | _string_ | :heavy_check_mark: | The cron expression.                            | 0 0 \* \* \*                          |
