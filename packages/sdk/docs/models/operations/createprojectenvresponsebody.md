# CreateProjectEnvResponseBody

The environment variable was created successfully

## Example Usage

```typescript
import { CreateProjectEnvResponseBody } from "@vercel/sdk/models/operations";

let value: CreateProjectEnvResponseBody = {
  created: {},
  failed: [
    {
      error: {
        code: "<value>",
        message: "<value>",
      },
    },
  ],
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `created`                                                | *operations.Created*                                     | :heavy_check_mark:                                       | N/A                                                      |
| `failed`                                                 | [operations.Failed](../../models/operations/failed.md)[] | :heavy_check_mark:                                       | N/A                                                      |