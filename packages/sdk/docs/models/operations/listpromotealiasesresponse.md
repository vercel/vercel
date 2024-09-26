# ListPromoteAliasesResponse

## Example Usage

```typescript
import { ListPromoteAliasesResponse } from "@vercel/sdk/models/operations/listpromotealiases.js";

let value: ListPromoteAliasesResponse = {
  result: {
    aliases: [
      {
        status: "<value>",
        alias: "<value>",
        id: "<id>",
      },
    ],
    pagination: {
      count: 20,
      next: 1540095775951,
      prev: 1540095775951,
    },
  },
};
```

## Fields

| Field                                       | Type                                        | Required                                    | Description                                 |
| ------------------------------------------- | ------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| `result`                                    | *operations.ListPromoteAliasesResponseBody* | :heavy_check_mark:                          | N/A                                         |