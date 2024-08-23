# ListDeploymentAliasesRequest

## Example Usage

```typescript
import { ListDeploymentAliasesRequest } from '@vercel/client/models/operations';

let value: ListDeploymentAliasesRequest = {
  id: 'dpl_FjvFJncQHQcZMznrUm9EoB8sFuPa',
};
```

## Fields

| Field    | Type     | Required           | Description                                               | Example                          |
| -------- | -------- | ------------------ | --------------------------------------------------------- | -------------------------------- |
| `id`     | _string_ | :heavy_check_mark: | The ID of the deployment the aliases should be listed for | dpl_FjvFJncQHQcZMznrUm9EoB8sFuPa |
| `teamId` | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of.  |                                  |
| `slug`   | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.        |                                  |
