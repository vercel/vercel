# ListPromoteAliasesRequest

## Example Usage

```typescript
import { ListPromoteAliasesRequest } from '@vercel/client/models/operations';

let value: ListPromoteAliasesRequest = {
  projectId: '<value>',
  limit: 20,
  since: 1609499532000,
  until: 1612264332000,
};
```

## Fields

| Field        | Type      | Required           | Description                                                                   | Example       |
| ------------ | --------- | ------------------ | ----------------------------------------------------------------------------- | ------------- |
| `projectId`  | _string_  | :heavy_check_mark: | N/A                                                                           |               |
| `limit`      | _number_  | :heavy_minus_sign: | Maximum number of aliases to list from a request (max 100).                   | 20            |
| `since`      | _number_  | :heavy_minus_sign: | Get aliases created after this epoch timestamp.                               | 1609499532000 |
| `until`      | _number_  | :heavy_minus_sign: | Get aliases created before this epoch timestamp.                              | 1612264332000 |
| `failedOnly` | _boolean_ | :heavy_minus_sign: | Filter results down to aliases that failed to map to the requested deployment |               |
| `teamId`     | _string_  | :heavy_minus_sign: | The Team identifier to perform the request on behalf of.                      |               |
| `slug`       | _string_  | :heavy_minus_sign: | The Team slug to perform the request on behalf of.                            |               |
