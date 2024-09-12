# ListPromoteAliasesResponseBody2

## Example Usage

```typescript
import { ListPromoteAliasesResponseBody2 } from "@vercel/sdk/models/operations";

let value: ListPromoteAliasesResponseBody2 = {
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
};
```

## Fields

| Field                                                                                                                                                           | Type                                                                                                                                                            | Required                                                                                                                                                        | Description                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aliases`                                                                                                                                                       | [operations.ResponseBodyAliases](../../models/operations/responsebodyaliases.md)[]                                                                              | :heavy_check_mark:                                                                                                                                              | N/A                                                                                                                                                             |
| `pagination`                                                                                                                                                    | [components.Pagination](../../models/components/pagination.md)                                                                                                  | :heavy_check_mark:                                                                                                                                              | This object contains information related to the pagination of the current request, including the necessary parameters to get the next or previous page of data. |