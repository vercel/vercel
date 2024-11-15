# SearchRepoResponseBody2

## Example Usage

```typescript
import { SearchRepoResponseBody2 } from "@vercel/sdk/models/operations/searchrepo.js";

let value: SearchRepoResponseBody2 = {
  gitAccount: {
    provider: "github",
    namespaceId: 9832.03,
  },
  repos: [
    {
      id: "<id>",
      provider: "github",
      url: "https://husky-swordfish.com/",
      name: "<value>",
      slug: "<value>",
      namespace: "<value>",
      owner: {
        id: 149.76,
        name: "<value>",
      },
      ownerType: "user",
      private: false,
      defaultBranch: "<value>",
      updatedAt: 6443.97,
    },
  ],
};
```

## Fields

| Field                                                          | Type                                                           | Required                                                       | Description                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `gitAccount`                                                   | [operations.GitAccount](../../models/operations/gitaccount.md) | :heavy_check_mark:                                             | N/A                                                            |
| `repos`                                                        | [operations.Repos](../../models/operations/repos.md)[]         | :heavy_check_mark:                                             | N/A                                                            |