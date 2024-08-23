# GetAllChecksResponseBody

## Example Usage

```typescript
import { GetAllChecksResponseBody } from '@vercel/client/models/operations';

let value: GetAllChecksResponseBody = {
  checks: [
    {
      createdAt: 992.8,
      id: '<id>',
      integrationId: '<value>',
      name: '<value>',
      rerequestable: false,
      status: 'registered',
      updatedAt: 9698.1,
    },
  ],
};
```

## Fields

| Field    | Type                                                     | Required           | Description |
| -------- | -------------------------------------------------------- | ------------------ | ----------- |
| `checks` | [operations.Checks](../../models/operations/checks.md)[] | :heavy_check_mark: | N/A         |
