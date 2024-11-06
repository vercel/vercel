# GetEdgeConfigBackupsRequest

## Example Usage

```typescript
import { GetEdgeConfigBackupsRequest } from "@vercel/sdk/models/operations/getedgeconfigbackups.js";

let value: GetEdgeConfigBackupsRequest = {
  edgeConfigId: "<id>",
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `edgeConfigId`                                           | *string*                                                 | :heavy_check_mark:                                       | N/A                                                      |
| `next`                                                   | *string*                                                 | :heavy_minus_sign:                                       | N/A                                                      |
| `limit`                                                  | *number*                                                 | :heavy_minus_sign:                                       | N/A                                                      |
| `metadata`                                               | *string*                                                 | :heavy_minus_sign:                                       | N/A                                                      |
| `teamId`                                                 | *string*                                                 | :heavy_minus_sign:                                       | The Team identifier to perform the request on behalf of. |
| `slug`                                                   | *string*                                                 | :heavy_minus_sign:                                       | The Team slug to perform the request on behalf of.       |