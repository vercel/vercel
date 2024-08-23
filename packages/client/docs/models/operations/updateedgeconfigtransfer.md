# UpdateEdgeConfigTransfer

Keeps track of the current state of the Edge Config while it gets transferred.

## Example Usage

```typescript
import { UpdateEdgeConfigTransfer } from '@vercel/client/models/operations';

let value: UpdateEdgeConfigTransfer = {
  fromAccountId: '<value>',
  startedAt: 3651,
  doneAt: 9920.74,
};
```

## Fields

| Field           | Type     | Required           | Description |
| --------------- | -------- | ------------------ | ----------- |
| `fromAccountId` | _string_ | :heavy_check_mark: | N/A         |
| `startedAt`     | _number_ | :heavy_check_mark: | N/A         |
| `doneAt`        | _number_ | :heavy_check_mark: | N/A         |
