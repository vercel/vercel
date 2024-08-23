# Pagination

This object contains information related to the pagination of the current request, including the necessary parameters to get the next or previous page of data.

## Example Usage

```typescript
import { Pagination } from '@vercel/client/models/components';

let value: Pagination = {
  count: 20,
  next: 1540095775951,
  prev: 1540095775951,
};
```

## Fields

| Field   | Type     | Required           | Description                                               | Example       |
| ------- | -------- | ------------------ | --------------------------------------------------------- | ------------- |
| `count` | _number_ | :heavy_check_mark: | Amount of items in the current page.                      | 20            |
| `next`  | _number_ | :heavy_check_mark: | Timestamp that must be used to request the next page.     | 1540095775951 |
| `prev`  | _number_ | :heavy_check_mark: | Timestamp that must be used to request the previous page. | 1540095775951 |
