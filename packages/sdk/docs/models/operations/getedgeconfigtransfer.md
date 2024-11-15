# GetEdgeConfigTransfer

Keeps track of the current state of the Edge Config while it gets transferred.

## Example Usage

```typescript
import { GetEdgeConfigTransfer } from "@vercel/sdk/models/operations/getedgeconfig.js";

let value: GetEdgeConfigTransfer = {
  fromAccountId: "<id>",
  startedAt: 9985.27,
  doneAt: 1315.76,
};
```

## Fields

| Field              | Type               | Required           | Description        |
| ------------------ | ------------------ | ------------------ | ------------------ |
| `fromAccountId`    | *string*           | :heavy_check_mark: | N/A                |
| `startedAt`        | *number*           | :heavy_check_mark: | N/A                |
| `doneAt`           | *number*           | :heavy_check_mark: | N/A                |