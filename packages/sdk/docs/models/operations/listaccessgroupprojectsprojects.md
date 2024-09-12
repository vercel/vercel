# ListAccessGroupProjectsProjects

## Example Usage

```typescript
import { ListAccessGroupProjectsProjects } from "@vercel/sdk/models/operations";

let value: ListAccessGroupProjectsProjects = {
  projectId: "<value>",
  role: "PROJECT_DEVELOPER",
  createdAt: "<value>",
  updatedAt: "<value>",
  project: {},
};
```

## Fields

| Field                                                                                                  | Type                                                                                                   | Required                                                                                               | Description                                                                                            |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `projectId`                                                                                            | *string*                                                                                               | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `role`                                                                                                 | [operations.ListAccessGroupProjectsRole](../../models/operations/listaccessgroupprojectsrole.md)       | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `createdAt`                                                                                            | *string*                                                                                               | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `updatedAt`                                                                                            | *string*                                                                                               | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `project`                                                                                              | [operations.ListAccessGroupProjectsProject](../../models/operations/listaccessgroupprojectsproject.md) | :heavy_check_mark:                                                                                     | N/A                                                                                                    |