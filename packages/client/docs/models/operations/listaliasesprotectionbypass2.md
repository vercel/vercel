# ListAliasesProtectionBypass2

The protection bypass for the alias

## Example Usage

```typescript
import { ListAliasesProtectionBypass2 } from '@vercel/client/models/operations';

let value: ListAliasesProtectionBypass2 = {
  createdAt: 1180.41,
  lastUpdatedAt: 6228.94,
  lastUpdatedBy: '<value>',
  access: 'granted',
  scope: 'user',
};
```

## Fields

| Field           | Type                                                                                                       | Required           | Description |
| --------------- | ---------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `createdAt`     | _number_                                                                                                   | :heavy_check_mark: | N/A         |
| `lastUpdatedAt` | _number_                                                                                                   | :heavy_check_mark: | N/A         |
| `lastUpdatedBy` | _string_                                                                                                   | :heavy_check_mark: | N/A         |
| `access`        | [operations.ProtectionBypassAccess](../../models/operations/protectionbypassaccess.md)                     | :heavy_check_mark: | N/A         |
| `scope`         | [operations.ListAliasesProtectionBypassScope](../../models/operations/listaliasesprotectionbypassscope.md) | :heavy_check_mark: | N/A         |
