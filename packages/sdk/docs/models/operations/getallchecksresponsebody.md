# GetAllChecksResponseBody

## Example Usage

```typescript
import { GetAllChecksResponseBody } from "@vercel/sdk/models/operations";

let value: GetAllChecksResponseBody = {
  checks: [
    {
      createdAt: 6976.31,
      id: "<id>",
      integrationId: "<value>",
      name: "<value>",
      rerequestable: false,
      status: "registered",
      updatedAt: 602.25,
    },
  ],
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `checks`                                                 | [operations.Checks](../../models/operations/checks.md)[] | :heavy_check_mark:                                       | N/A                                                      |