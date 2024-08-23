# GetEdgeConfigTransfer

Keeps track of the current state of the Edge Config while it gets transferred.

## Example Usage

```typescript
import { GetEdgeConfigTransfer } from '@vercel/client/models/operations';

let value: GetEdgeConfigTransfer = {
  fromAccountId: '<value>',
  startedAt: 4042.44,
  doneAt: 9583.08,
};
```

## Fields

| Field           | Type     | Required           | Description |
| --------------- | -------- | ------------------ | ----------- |
| `fromAccountId` | _string_ | :heavy_check_mark: | N/A         |
| `startedAt`     | _number_ | :heavy_check_mark: | N/A         |
| `doneAt`        | _number_ | :heavy_check_mark: | N/A         |
