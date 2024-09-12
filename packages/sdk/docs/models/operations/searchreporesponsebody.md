# SearchRepoResponseBody

## Example Usage

```typescript
import { SearchRepoResponseBody } from "@vercel/sdk/models/operations";

let value: SearchRepoResponseBody = {
  gitAccount: {
    provider: "gitlab",
    namespaceId: 2773.4,
  },
  repos: [
    {
      id: "<value>",
      provider: "gitlab",
      url: "https://circular-grand.com",
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
      updatedAt: 5854.32,
    },
  ],
};
```

## Fields

| Field                                                          | Type                                                           | Required                                                       | Description                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `gitAccount`                                                   | [operations.GitAccount](../../models/operations/gitaccount.md) | :heavy_check_mark:                                             | N/A                                                            |
| `repos`                                                        | [operations.Repos](../../models/operations/repos.md)[]         | :heavy_check_mark:                                             | N/A                                                            |