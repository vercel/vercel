# CreateEdgeConfigTransfer

Keeps track of the current state of the Edge Config while it gets transferred.

## Example Usage

```typescript
import { CreateEdgeConfigTransfer } from "@vercel/sdk/models/operations/createedgeconfig.js";

let value: CreateEdgeConfigTransfer = {
  fromAccountId: "<id>",
  startedAt: 4169.34,
  doneAt: 4004.70,
};
```

## Fields

| Field              | Type               | Required           | Description        |
| ------------------ | ------------------ | ------------------ | ------------------ |
| `fromAccountId`    | *string*           | :heavy_check_mark: | N/A                |
| `startedAt`        | *number*           | :heavy_check_mark: | N/A                |
| `doneAt`           | *number*           | :heavy_check_mark: | N/A                |