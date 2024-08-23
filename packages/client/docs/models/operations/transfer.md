# Transfer

Keeps track of the current state of the Edge Config while it gets transferred.

## Example Usage

```typescript
import { Transfer } from '@vercel/client/models/operations';

let value: Transfer = {
  fromAccountId: '<value>',
  startedAt: 6347.86,
  doneAt: 296.34,
};
```

## Fields

| Field           | Type     | Required           | Description |
| --------------- | -------- | ------------------ | ----------- |
| `fromAccountId` | _string_ | :heavy_check_mark: | N/A         |
| `startedAt`     | _number_ | :heavy_check_mark: | N/A         |
| `doneAt`        | _number_ | :heavy_check_mark: | N/A         |
