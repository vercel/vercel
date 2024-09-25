# SearchRepoResponseBody

## Example Usage

```typescript
import { SearchRepoResponseBody } from "@vercel/sdk/models/operations/searchrepo.js";

let value: SearchRepoResponseBody = {
  gitAccount: {
    provider: "gitlab",
    namespaceId: "<value>",
  },
  repos: [
    {
      id: 9605.22,
      provider: "bitbucket",
      url: "https://straight-basket.biz/",
      name: "<value>",
      slug: "<value>",
      namespace: "<value>",
      owner: {
        id: "<id>",
        name: "<value>",
      },
      ownerType: "user",
      private: false,
      defaultBranch: "<value>",
      updatedAt: 5283.15,
    },
  ],
};
```

## Fields

| Field                                                          | Type                                                           | Required                                                       | Description                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `gitAccount`                                                   | [operations.GitAccount](../../models/operations/gitaccount.md) | :heavy_check_mark:                                             | N/A                                                            |
| `repos`                                                        | [operations.Repos](../../models/operations/repos.md)[]         | :heavy_check_mark:                                             | N/A                                                            |