# ProtectionBypass3

The protection bypass for the alias

## Example Usage

```typescript
import { ProtectionBypass3 } from "@vercel/sdk/models/operations/getalias.js";

let value: ProtectionBypass3 = {
  createdAt: 9015.63,
  createdBy: "<value>",
  scope: "alias-protection-override",
};
```

## Fields

| Field                                                                                                              | Type                                                                                                               | Required                                                                                                           | Description                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `createdAt`                                                                                                        | *number*                                                                                                           | :heavy_check_mark:                                                                                                 | N/A                                                                                                                |
| `createdBy`                                                                                                        | *string*                                                                                                           | :heavy_check_mark:                                                                                                 | N/A                                                                                                                |
| `scope`                                                                                                            | [operations.GetAliasProtectionBypassAliasesScope](../../models/operations/getaliasprotectionbypassaliasesscope.md) | :heavy_check_mark:                                                                                                 | N/A                                                                                                                |