# UnpauseProjectRequest

## Example Usage

```typescript
import { UnpauseProjectRequest } from '@vercel/client/models/operations';

let value: UnpauseProjectRequest = {
  projectId: '<value>',
};
```

## Fields

| Field       | Type     | Required           | Description                                              |
| ----------- | -------- | ------------------ | -------------------------------------------------------- |
| `projectId` | _string_ | :heavy_check_mark: | The unique project identifier                            |
| `teamId`    | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`      | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
