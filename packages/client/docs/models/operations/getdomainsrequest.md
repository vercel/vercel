# GetDomainsRequest

## Example Usage

```typescript
import { GetDomainsRequest } from '@vercel/client/models/operations';

let value: GetDomainsRequest = {
  limit: 20,
  since: 1609499532000,
  until: 1612264332000,
};
```

## Fields

| Field    | Type     | Required           | Description                                              | Example       |
| -------- | -------- | ------------------ | -------------------------------------------------------- | ------------- |
| `limit`  | _number_ | :heavy_minus_sign: | Maximum number of domains to list from a request.        | 20            |
| `since`  | _number_ | :heavy_minus_sign: | Get domains created after this JavaScript timestamp.     | 1609499532000 |
| `until`  | _number_ | :heavy_minus_sign: | Get domains created before this JavaScript timestamp.    | 1612264332000 |
| `teamId` | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |               |
| `slug`   | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |               |
