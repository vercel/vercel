# Crons

## Example Usage

```typescript
import { Crons } from '@vercel/client/models/operations';

let value: Crons = {
  enabledAt: 1589.69,
  disabledAt: 3380.07,
  updatedAt: 1103.75,
  deploymentId: '<value>',
  definitions: [
    {
      host: 'vercel.com',
      path: '/api/crons/sync-something?hello=world',
      schedule: '0 0 * * *',
    },
  ],
};
```

## Fields

| Field          | Type                                                               | Required           | Description                                                                                                                        |
| -------------- | ------------------------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `enabledAt`    | _number_                                                           | :heavy_check_mark: | The time the feature was enabled for this project. Note: It enables automatically with the first Deployment that outputs cronjobs. |
| `disabledAt`   | _number_                                                           | :heavy_check_mark: | The time the feature was disabled for this project.                                                                                |
| `updatedAt`    | _number_                                                           | :heavy_check_mark: | N/A                                                                                                                                |
| `deploymentId` | _string_                                                           | :heavy_check_mark: | The ID of the Deployment from which the definitions originated.                                                                    |
| `definitions`  | [operations.Definitions](../../models/operations/definitions.md)[] | :heavy_check_mark: | N/A                                                                                                                                |
