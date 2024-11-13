# GetAllChecksResponseBody

## Example Usage

```typescript
import { GetAllChecksResponseBody } from "@vercel/sdk/models/operations/getallchecks.js";

let value: GetAllChecksResponseBody = {
  checks: [
    {
      createdAt: 4142.63,
      id: "<id>",
      integrationId: "<id>",
      name: "<value>",
      rerequestable: false,
      status: "registered",
      updatedAt: 6924.72,
    },
  ],
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `checks`                                                 | [operations.Checks](../../models/operations/checks.md)[] | :heavy_check_mark:                                       | N/A                                                      |