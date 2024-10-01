# ListAccessGroupProjectsResponseBody

## Example Usage

```typescript
import { ListAccessGroupProjectsResponseBody } from "@vercel/sdk/models/operations/listaccessgroupprojects.js";

let value: ListAccessGroupProjectsResponseBody = {
  projects: [
    {
      projectId: "<id>",
      role: "PROJECT_DEVELOPER",
      createdAt: "<value>",
      updatedAt: "<value>",
      project: {},
    },
  ],
  pagination: {
    count: 5701.97,
    next: "<value>",
  },
};
```

## Fields

| Field                                                                                                        | Type                                                                                                         | Required                                                                                                     | Description                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `projects`                                                                                                   | [operations.ListAccessGroupProjectsProjects](../../models/operations/listaccessgroupprojectsprojects.md)[]   | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `pagination`                                                                                                 | [operations.ListAccessGroupProjectsPagination](../../models/operations/listaccessgroupprojectspagination.md) | :heavy_check_mark:                                                                                           | N/A                                                                                                          |