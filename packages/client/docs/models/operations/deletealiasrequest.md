# DeleteAliasRequest

## Example Usage

```typescript
import { DeleteAliasRequest } from '@vercel/client/models/operations';

let value: DeleteAliasRequest = {
  aliasId: '<value>',
};
```

## Fields

| Field     | Type     | Required           | Description                                              |
| --------- | -------- | ------------------ | -------------------------------------------------------- |
| `aliasId` | _string_ | :heavy_check_mark: | The ID or alias that will be removed                     |
| `teamId`  | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`    | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
