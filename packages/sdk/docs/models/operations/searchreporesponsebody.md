# SearchRepoResponseBody

## Example Usage

```typescript
import { SearchRepoResponseBody } from "@vercel/sdk/models/operations/searchrepo.js";

let value: SearchRepoResponseBody = {
  gitAccount: {
    provider: "github",
    namespaceId: "<id>",
  },
  repos: [
    {
      id: 3842.73,
      provider: "gitlab",
      url: "https://cruel-extension.org/",
      name: "<value>",
      slug: "<value>",
      namespace: "<value>",
      owner: {
        id: 2075.13,
        name: "<value>",
      },
      ownerType: "team",
      private: false,
      defaultBranch: "<value>",
      updatedAt: 2733.49,
    },
  ],
};
```

## Fields

| Field                                                          | Type                                                           | Required                                                       | Description                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `gitAccount`                                                   | [operations.GitAccount](../../models/operations/gitaccount.md) | :heavy_check_mark:                                             | N/A                                                            |
| `repos`                                                        | [operations.Repos](../../models/operations/repos.md)[]         | :heavy_check_mark:                                             | N/A                                                            |