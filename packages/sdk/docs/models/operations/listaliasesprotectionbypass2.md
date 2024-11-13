# ListAliasesProtectionBypass2

The protection bypass for the alias

## Example Usage

```typescript
import { ListAliasesProtectionBypass2 } from "@vercel/sdk/models/operations/listaliases.js";

let value: ListAliasesProtectionBypass2 = {
  createdAt: 5006.77,
  lastUpdatedAt: 720.80,
  lastUpdatedBy: "<value>",
  access: "requested",
  scope: "user",
};
```

## Fields

| Field                                                                                                      | Type                                                                                                       | Required                                                                                                   | Description                                                                                                |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `createdAt`                                                                                                | *number*                                                                                                   | :heavy_check_mark:                                                                                         | N/A                                                                                                        |
| `lastUpdatedAt`                                                                                            | *number*                                                                                                   | :heavy_check_mark:                                                                                         | N/A                                                                                                        |
| `lastUpdatedBy`                                                                                            | *string*                                                                                                   | :heavy_check_mark:                                                                                         | N/A                                                                                                        |
| `access`                                                                                                   | [operations.ProtectionBypassAccess](../../models/operations/protectionbypassaccess.md)                     | :heavy_check_mark:                                                                                         | N/A                                                                                                        |
| `scope`                                                                                                    | [operations.ListAliasesProtectionBypassScope](../../models/operations/listaliasesprotectionbypassscope.md) | :heavy_check_mark:                                                                                         | N/A                                                                                                        |