# ProtectionBypass2

The protection bypass for the alias

## Example Usage

```typescript
import { ProtectionBypass2 } from "@vercel/sdk/models/operations/getalias.js";

let value: ProtectionBypass2 = {
  createdAt: 9101.31,
  lastUpdatedAt: 5344.32,
  lastUpdatedBy: "<value>",
  access: "requested",
  scope: "user",
};
```

## Fields

| Field                                                                                                | Type                                                                                                 | Required                                                                                             | Description                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `createdAt`                                                                                          | *number*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `lastUpdatedAt`                                                                                      | *number*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `lastUpdatedBy`                                                                                      | *string*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `access`                                                                                             | [operations.Access](../../models/operations/access.md)                                               | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `scope`                                                                                              | [operations.GetAliasProtectionBypassScope](../../models/operations/getaliasprotectionbypassscope.md) | :heavy_check_mark:                                                                                   | N/A                                                                                                  |