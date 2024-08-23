# ProtectionBypass2

The protection bypass for the alias

## Example Usage

```typescript
import { ProtectionBypass2 } from '@vercel/client/models/operations';

let value: ProtectionBypass2 = {
  createdAt: 4912.01,
  lastUpdatedAt: 7298.28,
  lastUpdatedBy: '<value>',
  access: 'requested',
  scope: 'user',
};
```

## Fields

| Field           | Type                                                                                                 | Required           | Description |
| --------------- | ---------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `createdAt`     | _number_                                                                                             | :heavy_check_mark: | N/A         |
| `lastUpdatedAt` | _number_                                                                                             | :heavy_check_mark: | N/A         |
| `lastUpdatedBy` | _string_                                                                                             | :heavy_check_mark: | N/A         |
| `access`        | [operations.Access](../../models/operations/access.md)                                               | :heavy_check_mark: | N/A         |
| `scope`         | [operations.GetAliasProtectionBypassScope](../../models/operations/getaliasprotectionbypassscope.md) | :heavy_check_mark: | N/A         |
