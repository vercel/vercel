# UpdateProjectCrons

## Example Usage

```typescript
import { UpdateProjectCrons } from "@vercel/sdk/models/operations/updateproject.js";

let value: UpdateProjectCrons = {
  enabledAt: 8093.65,
  disabledAt: 7090.35,
  updatedAt: 9543.34,
  deploymentId: "<id>",
  definitions: [
    {
      host: "vercel.com",
      path: "/api/crons/sync-something?hello=world",
      schedule: "0 0 * * *",
    },
  ],
};
```

## Fields

| Field                                                                                                                              | Type                                                                                                                               | Required                                                                                                                           | Description                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `enabledAt`                                                                                                                        | *number*                                                                                                                           | :heavy_check_mark:                                                                                                                 | The time the feature was enabled for this project. Note: It enables automatically with the first Deployment that outputs cronjobs. |
| `disabledAt`                                                                                                                       | *number*                                                                                                                           | :heavy_check_mark:                                                                                                                 | The time the feature was disabled for this project.                                                                                |
| `updatedAt`                                                                                                                        | *number*                                                                                                                           | :heavy_check_mark:                                                                                                                 | N/A                                                                                                                                |
| `deploymentId`                                                                                                                     | *string*                                                                                                                           | :heavy_check_mark:                                                                                                                 | The ID of the Deployment from which the definitions originated.                                                                    |
| `definitions`                                                                                                                      | [operations.UpdateProjectDefinitions](../../models/operations/updateprojectdefinitions.md)[]                                       | :heavy_check_mark:                                                                                                                 | N/A                                                                                                                                |