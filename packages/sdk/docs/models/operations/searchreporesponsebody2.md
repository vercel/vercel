# SearchRepoResponseBody2

## Example Usage

```typescript
import { SearchRepoResponseBody2 } from "@vercel/sdk/models/operations/searchrepo.js";

let value: SearchRepoResponseBody2 = {
  gitAccount: {
    provider: "github",
    namespaceId: 2250.02,
  },
  repos: [
    {
      id: 3269.42,
      provider: "github",
      url: "https://warm-cardboard.com/",
      name: "<value>",
      slug: "<value>",
      namespace: "<value>",
      owner: {
        id: 2542.88,
        name: "<value>",
      },
      ownerType: "team",
      private: false,
      defaultBranch: "<value>",
      updatedAt: 8167.26,
    },
  ],
};
```

## Fields

| Field                                                          | Type                                                           | Required                                                       | Description                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `gitAccount`                                                   | [operations.GitAccount](../../models/operations/gitaccount.md) | :heavy_check_mark:                                             | N/A                                                            |
| `repos`                                                        | [operations.Repos](../../models/operations/repos.md)[]         | :heavy_check_mark:                                             | N/A                                                            |