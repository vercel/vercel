# CreateProjectProtectionBypass

## Example Usage

```typescript
import { CreateProjectProtectionBypass } from '@vercel/client/models/operations';

let value: CreateProjectProtectionBypass = {
  createdAt: 7740.48,
  createdBy: '<value>',
  scope: 'automation-bypass',
};
```

## Fields

| Field       | Type                                                                           | Required           | Description |
| ----------- | ------------------------------------------------------------------------------ | ------------------ | ----------- |
| `createdAt` | _number_                                                                       | :heavy_check_mark: | N/A         |
| `createdBy` | _string_                                                                       | :heavy_check_mark: | N/A         |
| `scope`     | [operations.CreateProjectScope](../../models/operations/createprojectscope.md) | :heavy_check_mark: | N/A         |
