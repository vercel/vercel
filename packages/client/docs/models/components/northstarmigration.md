# NorthstarMigration

## Example Usage

```typescript
import { NorthstarMigration } from '@vercel/client/models/components';

let value: NorthstarMigration = {
  teamId: '<value>',
  projects: 1002.51,
  stores: 3178.98,
  integrationConfigurations: 7589.85,
  integrationClients: 5259.51,
  startTime: 170.6,
  endTime: 7042.71,
};
```

## Fields

| Field                       | Type     | Required           | Description                                                      |
| --------------------------- | -------- | ------------------ | ---------------------------------------------------------------- |
| `teamId`                    | _string_ | :heavy_check_mark: | The ID of the team we created for this user.                     |
| `projects`                  | _number_ | :heavy_check_mark: | The number of projects migrated for this user.                   |
| `stores`                    | _number_ | :heavy_check_mark: | The number of stores migrated for this user.                     |
| `integrationConfigurations` | _number_ | :heavy_check_mark: | The number of integration configurations migrated for this user. |
| `integrationClients`        | _number_ | :heavy_check_mark: | The number of integration clients migrated for this user.        |
| `startTime`                 | _number_ | :heavy_check_mark: | The migration start time timestamp for this user.                |
| `endTime`                   | _number_ | :heavy_check_mark: | The migration end time timestamp for this user.                  |
