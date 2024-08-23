# ReadAccessGroupRequest

## Example Usage

```typescript
import { ReadAccessGroupRequest } from '@vercel/client/models/operations';

let value: ReadAccessGroupRequest = {
  idOrName: '<value>',
};
```

## Fields

| Field      | Type     | Required           | Description                                              |
| ---------- | -------- | ------------------ | -------------------------------------------------------- |
| `idOrName` | _string_ | :heavy_check_mark: | N/A                                                      |
| `teamId`   | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`     | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
