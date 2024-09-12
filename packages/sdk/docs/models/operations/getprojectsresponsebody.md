# GetProjectsResponseBody

The paginated list of projects

## Example Usage

```typescript
import { GetProjectsResponseBody } from "@vercel/sdk/models/operations";

let value: GetProjectsResponseBody = {
  projects: [],
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
| `projects`                                                                                                                                                      | [operations.GetProjectsProjects](../../models/operations/getprojectsprojects.md)[]                                                                              | :heavy_check_mark:                                                                                                                                              | N/A                                                                                                                                                             |
| `pagination`                                                                                                                                                    | [components.Pagination](../../models/components/pagination.md)                                                                                                  | :heavy_check_mark:                                                                                                                                              | This object contains information related to the pagination of the current request, including the necessary parameters to get the next or previous page of data. |