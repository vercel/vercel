# Repos

## Example Usage

```typescript
import { Repos } from "@vercel/sdk/models/operations";

let value: Repos = {
  id: 6423.52,
  provider: "github-custom-host",
  url: "http://hairy-mechanism.biz",
  name: "<value>",
  slug: "<value>",
  namespace: "<value>",
  owner: {
    id: "<value>",
    name: "<value>",
  },
  ownerType: "user",
  private: false,
  defaultBranch: "<value>",
  updatedAt: 2005.16,
};
```

## Fields

| Field                                                                                                  | Type                                                                                                   | Required                                                                                               | Description                                                                                            |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `id`                                                                                                   | *operations.SearchRepoId*                                                                              | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `provider`                                                                                             | [operations.SearchRepoIntegrationsProvider](../../models/operations/searchrepointegrationsprovider.md) | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `url`                                                                                                  | *string*                                                                                               | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `name`                                                                                                 | *string*                                                                                               | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `slug`                                                                                                 | *string*                                                                                               | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `namespace`                                                                                            | *string*                                                                                               | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `owner`                                                                                                | [operations.Owner](../../models/operations/owner.md)                                                   | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `ownerType`                                                                                            | [operations.OwnerType](../../models/operations/ownertype.md)                                           | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `private`                                                                                              | *boolean*                                                                                              | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `defaultBranch`                                                                                        | *string*                                                                                               | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `updatedAt`                                                                                            | *number*                                                                                               | :heavy_check_mark:                                                                                     | N/A                                                                                                    |