# DeleteIntegrationLogDrainRequest

## Example Usage

```typescript
import { DeleteIntegrationLogDrainRequest } from '@vercel/client/models/operations';

let value: DeleteIntegrationLogDrainRequest = {
  id: '<id>',
};
```

## Fields

| Field    | Type     | Required           | Description                                              |
| -------- | -------- | ------------------ | -------------------------------------------------------- |
| `id`     | _string_ | :heavy_check_mark: | ID of the log drain to be deleted                        |
| `teamId` | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`   | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
