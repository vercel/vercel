# GetAliasRequest

## Example Usage

```typescript
import { GetAliasRequest } from '@vercel/client/models/operations';

let value: GetAliasRequest = {
  from: 1540095775951,
  idOrAlias: 'example.vercel.app',
  projectId: 'prj_12HKQaOmR5t5Uy6vdcQsNIiZgHGB',
  since: 1540095775941,
  until: 1540095775951,
};
```

## Fields

| Field       | Type     | Required           | Description                                                           | Example                          |
| ----------- | -------- | ------------------ | --------------------------------------------------------------------- | -------------------------------- |
| `from`      | _number_ | :heavy_minus_sign: | Get the alias only if it was created after the provided timestamp     | 1540095775951                    |
| `idOrAlias` | _string_ | :heavy_check_mark: | The alias or alias ID to be retrieved                                 | example.vercel.app               |
| `projectId` | _string_ | :heavy_minus_sign: | Get the alias only if it is assigned to the provided project ID       | prj_12HKQaOmR5t5Uy6vdcQsNIiZgHGB |
| `since`     | _number_ | :heavy_minus_sign: | Get the alias only if it was created after this JavaScript timestamp  | 1540095775941                    |
| `until`     | _number_ | :heavy_minus_sign: | Get the alias only if it was created before this JavaScript timestamp | 1540095775951                    |
| `teamId`    | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of.              |                                  |
| `slug`      | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.                    |                                  |
