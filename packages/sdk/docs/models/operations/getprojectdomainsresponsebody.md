# GetProjectDomainsResponseBody

Successful response retrieving a list of domains

## Example Usage

```typescript
import { GetProjectDomainsResponseBody } from "@vercel/sdk/models/operations";

let value: GetProjectDomainsResponseBody = {
  domains: [
    {
      name: "<value>",
      apexName: "<value>",
      projectId: "<value>",
      verified: false,
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
| `domains`                                                                                                                                                       | [operations.GetProjectDomainsDomains](../../models/operations/getprojectdomainsdomains.md)[]                                                                    | :heavy_check_mark:                                                                                                                                              | N/A                                                                                                                                                             |
| `pagination`                                                                                                                                                    | [components.Pagination](../../models/components/pagination.md)                                                                                                  | :heavy_check_mark:                                                                                                                                              | This object contains information related to the pagination of the current request, including the necessary parameters to get the next or previous page of data. |