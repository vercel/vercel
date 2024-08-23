# DeleteProjectRequest

## Example Usage

```typescript
import { DeleteProjectRequest } from '@vercel/client/models/operations';

let value: DeleteProjectRequest = {
  idOrName: 'prj_12HKQaOmR5t5Uy6vdcQsNIiZgHGB',
};
```

## Fields

| Field      | Type     | Required           | Description                                              | Example                          |
| ---------- | -------- | ------------------ | -------------------------------------------------------- | -------------------------------- |
| `idOrName` | _string_ | :heavy_check_mark: | The unique project identifier or the project name        | prj_12HKQaOmR5t5Uy6vdcQsNIiZgHGB |
| `teamId`   | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |                                  |
| `slug`     | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |                                  |
