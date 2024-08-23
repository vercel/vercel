# ProtectionBypass4

The protection bypass for the alias

## Example Usage

```typescript
import { ProtectionBypass4 } from '@vercel/client/models/operations';

let value: ProtectionBypass4 = {
  createdAt: 1348.18,
  lastUpdatedAt: 3165.01,
  lastUpdatedBy: '<value>',
  scope: 'email_invite',
};
```

## Fields

| Field           | Type                                                                                                                               | Required           | Description |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `createdAt`     | _number_                                                                                                                           | :heavy_check_mark: | N/A         |
| `lastUpdatedAt` | _number_                                                                                                                           | :heavy_check_mark: | N/A         |
| `lastUpdatedBy` | _string_                                                                                                                           | :heavy_check_mark: | N/A         |
| `scope`         | [operations.GetAliasProtectionBypassAliasesResponseScope](../../models/operations/getaliasprotectionbypassaliasesresponsescope.md) | :heavy_check_mark: | N/A         |
