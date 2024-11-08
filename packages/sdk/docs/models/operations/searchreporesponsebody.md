# SearchRepoResponseBody


## Supported Types

### `operations.SearchRepoResponseBody1`

```typescript
const value: operations.SearchRepoResponseBody1 = {};
```

### `operations.SearchRepoResponseBody2`

```typescript
const value: operations.SearchRepoResponseBody2 = {
  gitAccount: {
    provider: "bitbucket",
    namespaceId: "<id>",
  },
  repos: [
    {
      id: "<id>",
      provider: "gitlab",
      url: "https://pleasing-unblinking.com/",
      name: "<value>",
      slug: "<value>",
      namespace: "<value>",
      owner: {
        id: 6090.94,
        name: "<value>",
      },
      ownerType: "user",
      private: false,
      defaultBranch: "<value>",
      updatedAt: 62.03,
    },
  ],
};
```

