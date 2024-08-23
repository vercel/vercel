# ProtectionBypass

## Example Usage

```typescript
import { ProtectionBypass } from '@vercel/client/models/operations';

let value: ProtectionBypass = {
  createdAt: 8817.36,
  createdBy: '<value>',
  scope: 'automation-bypass',
};
```

## Fields

| Field       | Type                                                 | Required           | Description |
| ----------- | ---------------------------------------------------- | ------------------ | ----------- |
| `createdAt` | _number_                                             | :heavy_check_mark: | N/A         |
| `createdBy` | _string_                                             | :heavy_check_mark: | N/A         |
| `scope`     | [operations.Scope](../../models/operations/scope.md) | :heavy_check_mark: | N/A         |
