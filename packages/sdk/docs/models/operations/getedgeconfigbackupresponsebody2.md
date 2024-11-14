# GetEdgeConfigBackupResponseBody2

## Example Usage

```typescript
import { GetEdgeConfigBackupResponseBody2 } from "@vercel/sdk/models/operations/getedgeconfigbackup.js";

let value: GetEdgeConfigBackupResponseBody2 = {
  user: {
    id: "<id>",
    username: "Lambert.Ward18",
    email: "Fabian89@gmail.com",
  },
  id: "<id>",
  lastModified: 6628.56,
  backup: {
    digest: "<value>",
    items: {},
    slug: "<value>",
    updatedAt: 8453.65,
  },
  metadata: {},
};
```

## Fields

| Field                                                                              | Type                                                                               | Required                                                                           | Description                                                                        |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `user`                                                                             | [operations.ResponseBodyUser](../../models/operations/responsebodyuser.md)         | :heavy_check_mark:                                                                 | N/A                                                                                |
| `id`                                                                               | *string*                                                                           | :heavy_check_mark:                                                                 | N/A                                                                                |
| `lastModified`                                                                     | *number*                                                                           | :heavy_check_mark:                                                                 | N/A                                                                                |
| `backup`                                                                           | [operations.ResponseBodyBackup](../../models/operations/responsebodybackup.md)     | :heavy_check_mark:                                                                 | N/A                                                                                |
| `metadata`                                                                         | [operations.ResponseBodyMetadata](../../models/operations/responsebodymetadata.md) | :heavy_check_mark:                                                                 | N/A                                                                                |