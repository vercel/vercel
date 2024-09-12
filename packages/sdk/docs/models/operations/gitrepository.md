# GitRepository

The Git Repository that will be connected to the project. When this is defined, any pushes to the specified connected Git Repository will be automatically deployed

## Example Usage

```typescript
import { GitRepository } from "@vercel/sdk/models/operations";

let value: GitRepository = {
  repo: "<value>",
  type: "github",
};
```

## Fields

| Field                                                                                        | Type                                                                                         | Required                                                                                     | Description                                                                                  |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `repo`                                                                                       | *string*                                                                                     | :heavy_check_mark:                                                                           | The name of the git repository. For example: \"vercel/next.js\"                              |
| `type`                                                                                       | [operations.CreateProjectProjectsType](../../models/operations/createprojectprojectstype.md) | :heavy_check_mark:                                                                           | The Git Provider of the repository                                                           |