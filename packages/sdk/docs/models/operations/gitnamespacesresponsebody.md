# GitNamespacesResponseBody

## Example Usage

```typescript
import { GitNamespacesResponseBody } from "@vercel/sdk/models/operations/gitnamespaces.js";

let value: GitNamespacesResponseBody = {
  provider: "<value>",
  slug: "<value>",
  id: 7468.34,
  ownerType: "<value>",
};
```

## Fields

| Field                        | Type                         | Required                     | Description                  |
| ---------------------------- | ---------------------------- | ---------------------------- | ---------------------------- |
| `provider`                   | *string*                     | :heavy_check_mark:           | N/A                          |
| `slug`                       | *string*                     | :heavy_check_mark:           | N/A                          |
| `id`                         | *operations.GitNamespacesId* | :heavy_check_mark:           | N/A                          |
| `ownerType`                  | *string*                     | :heavy_check_mark:           | N/A                          |
| `name`                       | *string*                     | :heavy_minus_sign:           | N/A                          |
| `isAccessRestricted`         | *boolean*                    | :heavy_minus_sign:           | N/A                          |
| `installationId`             | *number*                     | :heavy_minus_sign:           | N/A                          |
| `requireReauth`              | *boolean*                    | :heavy_minus_sign:           | N/A                          |