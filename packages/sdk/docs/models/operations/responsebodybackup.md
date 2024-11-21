# ResponseBodyBackup

## Example Usage

```typescript
import { ResponseBodyBackup } from "@vercel/sdk/models/operations/getedgeconfigbackup.js";

let value: ResponseBodyBackup = {
  digest: "<value>",
  items: {},
  slug: "<value>",
  updatedAt: 3931.22,
};
```

## Fields

| Field                                                                                                                                                 | Type                                                                                                                                                  | Required                                                                                                                                              | Description                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `digest`                                                                                                                                              | *string*                                                                                                                                              | :heavy_check_mark:                                                                                                                                    | N/A                                                                                                                                                   |
| `items`                                                                                                                                               | Record<string, [operations.GetEdgeConfigBackupResponseBodyItems](../../models/operations/getedgeconfigbackupresponsebodyitems.md)>                    | :heavy_check_mark:                                                                                                                                    | N/A                                                                                                                                                   |
| `slug`                                                                                                                                                | *string*                                                                                                                                              | :heavy_check_mark:                                                                                                                                    | Name for the Edge Config Names are not unique. Must start with an alphabetic character and can contain only alphanumeric characters and underscores). |
| `updatedAt`                                                                                                                                           | *number*                                                                                                                                              | :heavy_check_mark:                                                                                                                                    | N/A                                                                                                                                                   |