# GetProjectsProtectionBypass

## Example Usage

```typescript
import { GetProjectsProtectionBypass } from '@vercel/client/models/operations';

let value: GetProjectsProtectionBypass = {
  createdAt: 4785.96,
  createdBy: '<value>',
  scope: 'automation-bypass',
};
```

## Fields

| Field       | Type                                                                       | Required           | Description |
| ----------- | -------------------------------------------------------------------------- | ------------------ | ----------- |
| `createdAt` | _number_                                                                   | :heavy_check_mark: | N/A         |
| `createdBy` | _string_                                                                   | :heavy_check_mark: | N/A         |
| `scope`     | [operations.GetProjectsScope](../../models/operations/getprojectsscope.md) | :heavy_check_mark: | N/A         |
