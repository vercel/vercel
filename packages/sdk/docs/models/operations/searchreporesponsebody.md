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
    provider: "github",
    namespaceId: 9444.04,
  },
  repos: [
    {
      id: "<id>",
      provider: "gitlab",
      url: "https://dependent-account.com",
      name: "<value>",
      slug: "<value>",
      namespace: "<value>",
      owner: {
        id: 9427.79,
        name: "<value>",
      },
      ownerType: "team",
      private: false,
      defaultBranch: "<value>",
      updatedAt: 7143.00,
    },
  ],
};
```

