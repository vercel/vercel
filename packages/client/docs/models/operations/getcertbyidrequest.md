# GetCertByIdRequest

## Example Usage

```typescript
import { GetCertByIdRequest } from '@vercel/client/models/operations';

let value: GetCertByIdRequest = {
  id: '<id>',
};
```

## Fields

| Field    | Type     | Required           | Description                                              |
| -------- | -------- | ------------------ | -------------------------------------------------------- |
| `id`     | _string_ | :heavy_check_mark: | The cert id                                              |
| `teamId` | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`   | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
