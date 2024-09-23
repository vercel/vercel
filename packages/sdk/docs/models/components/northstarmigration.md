# NorthstarMigration

## Example Usage

```typescript
import { NorthstarMigration } from "@vercel/sdk/models/components/authuser.js";

let value: NorthstarMigration = {
  teamId: "<value>",
  projects: 2878.34,
  stores: 4949.72,
  integrationConfigurations: 1862.12,
  integrationClients: 1884.00,
  startTime: 4358.41,
  endTime: 7385.92,
};
```

## Fields

| Field                                                            | Type                                                             | Required                                                         | Description                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `teamId`                                                         | *string*                                                         | :heavy_check_mark:                                               | The ID of the team we created for this user.                     |
| `projects`                                                       | *number*                                                         | :heavy_check_mark:                                               | The number of projects migrated for this user.                   |
| `stores`                                                         | *number*                                                         | :heavy_check_mark:                                               | The number of stores migrated for this user.                     |
| `integrationConfigurations`                                      | *number*                                                         | :heavy_check_mark:                                               | The number of integration configurations migrated for this user. |
| `integrationClients`                                             | *number*                                                         | :heavy_check_mark:                                               | The number of integration clients migrated for this user.        |
| `startTime`                                                      | *number*                                                         | :heavy_check_mark:                                               | The migration start time timestamp for this user.                |
| `endTime`                                                        | *number*                                                         | :heavy_check_mark:                                               | The migration end time timestamp for this user.                  |