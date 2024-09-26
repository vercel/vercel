# GetAllChecksResponseBody

## Example Usage

```typescript
import { GetAllChecksResponseBody } from "@vercel/sdk/models/operations/getallchecks.js";

let value: GetAllChecksResponseBody = {
  checks: [
    {
      createdAt: 1317.98,
      id: "<id>",
      integrationId: "<value>",
      name: "<value>",
      rerequestable: false,
      status: "completed",
      updatedAt: 2894.06,
    },
  ],
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `checks`                                                 | [operations.Checks](../../models/operations/checks.md)[] | :heavy_check_mark:                                       | N/A                                                      |