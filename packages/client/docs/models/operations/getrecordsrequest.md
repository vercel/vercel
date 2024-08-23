# GetRecordsRequest

## Example Usage

```typescript
import { GetRecordsRequest } from '@vercel/client/models/operations';

let value: GetRecordsRequest = {
  domain: 'example.com',
  limit: '20',
  since: '1609499532000',
  until: '1612264332000',
};
```

## Fields

| Field    | Type     | Required           | Description                                              | Example       |
| -------- | -------- | ------------------ | -------------------------------------------------------- | ------------- |
| `domain` | _string_ | :heavy_check_mark: | N/A                                                      | example.com   |
| `limit`  | _string_ | :heavy_minus_sign: | Maximum number of records to list from a request.        | 20            |
| `since`  | _string_ | :heavy_minus_sign: | Get records created after this JavaScript timestamp.     | 1609499532000 |
| `until`  | _string_ | :heavy_minus_sign: | Get records created before this JavaScript timestamp.    | 1612264332000 |
| `teamId` | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |               |
| `slug`   | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |               |
