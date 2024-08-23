# CreateEdgeConfigTransfer

Keeps track of the current state of the Edge Config while it gets transferred.

## Example Usage

```typescript
import { CreateEdgeConfigTransfer } from '@vercel/client/models/operations';

let value: CreateEdgeConfigTransfer = {
  fromAccountId: '<value>',
  startedAt: 291.9,
  doneAt: 12.07,
};
```

## Fields

| Field           | Type     | Required           | Description |
| --------------- | -------- | ------------------ | ----------- |
| `fromAccountId` | _string_ | :heavy_check_mark: | N/A         |
| `startedAt`     | _number_ | :heavy_check_mark: | N/A         |
| `doneAt`        | _number_ | :heavy_check_mark: | N/A         |
