# ProtectionBypass1

The protection bypass for the alias

## Example Usage

```typescript
import { ProtectionBypass1 } from "@vercel/sdk/models/operations/getalias.js";

let value: ProtectionBypass1 = {
  createdAt: 5753.97,
  createdBy: "<value>",
  scope: "shareable-link",
};
```

## Fields

| Field                                                                                | Type                                                                                 | Required                                                                             | Description                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `createdAt`                                                                          | *number*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `createdBy`                                                                          | *string*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `scope`                                                                              | [operations.ProtectionBypassScope](../../models/operations/protectionbypassscope.md) | :heavy_check_mark:                                                                   | N/A                                                                                  |