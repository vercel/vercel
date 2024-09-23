# ResponseBody3

Successful response retrieving a list of paginated DNS records.

## Example Usage

```typescript
import { ResponseBody3 } from "@vercel/sdk/models/operations/getrecords.js";

let value: ResponseBody3 = {
  records: [
    {
      id: "<id>",
      slug: "<value>",
      name: "<value>",
      type: "ALIAS",
      value: "<value>",
      creator: "<value>",
      created: 380.45,
      updated: 9565.44,
      createdAt: 6671.69,
      updatedAt: 9642.00,
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
| `records`                                                                                                                                                       | [operations.ResponseBodyRecords](../../models/operations/responsebodyrecords.md)[]                                                                              | :heavy_check_mark:                                                                                                                                              | N/A                                                                                                                                                             |
| `pagination`                                                                                                                                                    | [components.Pagination](../../models/components/pagination.md)                                                                                                  | :heavy_check_mark:                                                                                                                                              | This object contains information related to the pagination of the current request, including the necessary parameters to get the next or previous page of data. |