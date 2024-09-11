# GetProjectsResponse

## Example Usage

```typescript
import { GetProjectsResponse } from "@vercel/sdk/models/operations";

let value: GetProjectsResponse = {
  result: {
    projects: [],
    pagination: {
      count: 20,
      next: 1540095775951,
      prev: 1540095775951,
    },
  },
};
```

## Fields

| Field                                                                                    | Type                                                                                     | Required                                                                                 | Description                                                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `result`                                                                                 | [operations.GetProjectsResponseBody](../../models/operations/getprojectsresponsebody.md) | :heavy_check_mark:                                                                       | N/A                                                                                      |