# ListAccessGroupProjectsResponseBody

## Example Usage

```typescript
import { ListAccessGroupProjectsResponseBody } from "@vercel/sdk/models/operations/listaccessgroupprojects.js";

let value: ListAccessGroupProjectsResponseBody = {
  projects: [
    {
      projectId: "<id>",
      role: "ADMIN",
      createdAt: "<value>",
      updatedAt: "<value>",
      project: {},
    },
  ],
  pagination: {
    count: 6667.67,
    next: "<value>",
  },
};
```

## Fields

| Field                                                                                                        | Type                                                                                                         | Required                                                                                                     | Description                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `projects`                                                                                                   | [operations.ListAccessGroupProjectsProjects](../../models/operations/listaccessgroupprojectsprojects.md)[]   | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `pagination`                                                                                                 | [operations.ListAccessGroupProjectsPagination](../../models/operations/listaccessgroupprojectspagination.md) | :heavy_check_mark:                                                                                           | N/A                                                                                                          |