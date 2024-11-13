# GetEdgeConfigBackupsResponseBody

## Example Usage

```typescript
import { GetEdgeConfigBackupsResponseBody } from "@vercel/sdk/models/operations/getedgeconfigbackups.js";

let value: GetEdgeConfigBackupsResponseBody = {
  backups: [
    {
      id: "<id>",
      lastModified: 4562.23,
    },
  ],
  pagination: {
    hasNext: false,
  },
};
```

## Fields

| Field                                                                                                  | Type                                                                                                   | Required                                                                                               | Description                                                                                            |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `backups`                                                                                              | [operations.Backups](../../models/operations/backups.md)[]                                             | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `pagination`                                                                                           | [operations.GetEdgeConfigBackupsPagination](../../models/operations/getedgeconfigbackupspagination.md) | :heavy_check_mark:                                                                                     | N/A                                                                                                    |