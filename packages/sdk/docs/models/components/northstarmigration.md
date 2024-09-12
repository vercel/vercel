# NorthstarMigration

## Example Usage

```typescript
import { NorthstarMigration } from "@vercel/sdk/models/components";

let value: NorthstarMigration = {
  teamId: "<value>",
  projects: 6150.58,
  stores: 1178.19,
  integrationConfigurations: 5524.39,
  integrationClients: 3563.15,
  startTime: 2959.5,
  endTime: 2662.84,
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