# ProtectionBypass1

The protection bypass for the alias

## Example Usage

```typescript
import { ProtectionBypass1 } from '@vercel/client/models/operations';

let value: ProtectionBypass1 = {
  createdAt: 691.82,
  createdBy: '<value>',
  scope: 'shareable-link',
};
```

## Fields

| Field       | Type                                                                                 | Required           | Description |
| ----------- | ------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `createdAt` | _number_                                                                             | :heavy_check_mark: | N/A         |
| `createdBy` | _string_                                                                             | :heavy_check_mark: | N/A         |
| `scope`     | [operations.ProtectionBypassScope](../../models/operations/protectionbypassscope.md) | :heavy_check_mark: | N/A         |
