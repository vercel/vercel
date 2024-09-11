# CreateAccessGroupProjects

## Example Usage

```typescript
import { CreateAccessGroupProjects } from "@vercel/sdk/models/operations";

let value: CreateAccessGroupProjects = {
  projectId: "prj_ndlgr43fadlPyCtREAqxxdyFK",
  role: "ADMIN",
};
```

## Fields

| Field                                                                                                   | Type                                                                                                    | Required                                                                                                | Description                                                                                             | Example                                                                                                 |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `projectId`                                                                                             | *string*                                                                                                | :heavy_check_mark:                                                                                      | The ID of the project.                                                                                  | prj_ndlgr43fadlPyCtREAqxxdyFK                                                                           |
| `role`                                                                                                  | [operations.CreateAccessGroupRole](../../models/operations/createaccessgrouprole.md)                    | :heavy_check_mark:                                                                                      | The project role that will be added to this Access Group. \"null\" will remove this project level role. | ADMIN                                                                                                   |