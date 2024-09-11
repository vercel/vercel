# ListAccessGroupProjectsResponseBody

## Example Usage

```typescript
import { ListAccessGroupProjectsResponseBody } from "@vercel/sdk/models/operations";

let value: ListAccessGroupProjectsResponseBody = {
  projects: [
    {
      projectId: "<value>",
      role: "PROJECT_VIEWER",
      createdAt: "<value>",
      updatedAt: "<value>",
      project: {},
    },
  ],
  pagination: {
    count: 4614.79,
    next: "<value>",
  },
};
```

## Fields

| Field                                                                                                        | Type                                                                                                         | Required                                                                                                     | Description                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `projects`                                                                                                   | [operations.ListAccessGroupProjectsProjects](../../models/operations/listaccessgroupprojectsprojects.md)[]   | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `pagination`                                                                                                 | [operations.ListAccessGroupProjectsPagination](../../models/operations/listaccessgroupprojectspagination.md) | :heavy_check_mark:                                                                                           | N/A                                                                                                          |