# ProtectionBypass3

The protection bypass for the alias

## Example Usage

```typescript
import { ProtectionBypass3 } from '@vercel/client/models/operations';

let value: ProtectionBypass3 = {
  createdAt: 9650.9,
  createdBy: '<value>',
  scope: 'alias-protection-override',
};
```

## Fields

| Field       | Type                                                                                                               | Required           | Description |
| ----------- | ------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `createdAt` | _number_                                                                                                           | :heavy_check_mark: | N/A         |
| `createdBy` | _string_                                                                                                           | :heavy_check_mark: | N/A         |
| `scope`     | [operations.GetAliasProtectionBypassAliasesScope](../../models/operations/getaliasprotectionbypassaliasesscope.md) | :heavy_check_mark: | N/A         |
