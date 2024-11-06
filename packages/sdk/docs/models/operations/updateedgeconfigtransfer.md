# UpdateEdgeConfigTransfer

Keeps track of the current state of the Edge Config while it gets transferred.

## Example Usage

```typescript
import { UpdateEdgeConfigTransfer } from "@vercel/sdk/models/operations/updateedgeconfig.js";

let value: UpdateEdgeConfigTransfer = {
  fromAccountId: "<id>",
  startedAt: 4526.54,
  doneAt: 7137.18,
};
```

## Fields

| Field              | Type               | Required           | Description        |
| ------------------ | ------------------ | ------------------ | ------------------ |
| `fromAccountId`    | *string*           | :heavy_check_mark: | N/A                |
| `startedAt`        | *number*           | :heavy_check_mark: | N/A                |
| `doneAt`           | *number*           | :heavy_check_mark: | N/A                |