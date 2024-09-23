# Repos

## Example Usage

```typescript
import { Repos } from "@vercel/sdk/models/operations/searchrepo.js";

let value: Repos = {
  id: "<id>",
  provider: "github",
  url: "https://lean-packaging.com/",
  name: "<value>",
  slug: "<value>",
  namespace: "<value>",
  owner: {
    id: 8018.16,
    name: "<value>",
  },
  ownerType: "user",
  private: false,
  defaultBranch: "<value>",
  updatedAt: 4151.25,
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