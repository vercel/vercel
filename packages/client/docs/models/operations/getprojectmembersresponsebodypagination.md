# GetProjectMembersResponseBodyPagination

## Example Usage

```typescript
import { GetProjectMembersResponseBodyPagination } from '@vercel/client/models/operations';

let value: GetProjectMembersResponseBodyPagination = {
  hasNext: false,
  count: 20,
  next: 1540095775951,
  prev: 1540095775951,
};
```

## Fields

| Field     | Type      | Required           | Description                                               | Example       |
| --------- | --------- | ------------------ | --------------------------------------------------------- | ------------- |
| `hasNext` | _boolean_ | :heavy_check_mark: | N/A                                                       |               |
| `count`   | _number_  | :heavy_check_mark: | Amount of items in the current page.                      | 20            |
| `next`    | _number_  | :heavy_check_mark: | Timestamp that must be used to request the next page.     | 1540095775951 |
| `prev`    | _number_  | :heavy_check_mark: | Timestamp that must be used to request the previous page. | 1540095775951 |
