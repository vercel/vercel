# GetEdgeConfigBackupResponseBody1

The object the API responds with when requesting an Edge Config backup

## Example Usage

```typescript
import { GetEdgeConfigBackupResponseBody1 } from "@vercel/sdk/models/operations/getedgeconfigbackup.js";

let value: GetEdgeConfigBackupResponseBody1 = {
  id: "<id>",
  lastModified: 665.96,
  backup: {
    digest: "<value>",
    items: {},
    slug: "<value>",
    updatedAt: 2359.70,
  },
  metadata: {},
};
```

## Fields

| Field                                                                                                            | Type                                                                                                             | Required                                                                                                         | Description                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `id`                                                                                                             | *string*                                                                                                         | :heavy_check_mark:                                                                                               | N/A                                                                                                              |
| `lastModified`                                                                                                   | *number*                                                                                                         | :heavy_check_mark:                                                                                               | N/A                                                                                                              |
| `backup`                                                                                                         | [operations.Backup](../../models/operations/backup.md)                                                           | :heavy_check_mark:                                                                                               | N/A                                                                                                              |
| `metadata`                                                                                                       | [operations.Metadata](../../models/operations/metadata.md)                                                       | :heavy_check_mark:                                                                                               | N/A                                                                                                              |
| `user`                                                                                                           | [operations.GetEdgeConfigBackupResponseBodyUser](../../models/operations/getedgeconfigbackupresponsebodyuser.md) | :heavy_minus_sign:                                                                                               | N/A                                                                                                              |