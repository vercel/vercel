# CreateProjectEnvRequestBody


## Supported Types

### `operations.CreateProjectEnvRequestBody1`

```typescript
const value: operations.CreateProjectEnvRequestBody1 = {
  key: "API_URL",
  value: "https://api.vercel.com",
  type: "plain",
  target: [
    "preview",
  ],
  gitBranch: "feature-1",
  comment: "database connection string for production",
};
```

### `operations.CreateProjectEnvRequestBody2[]`

```typescript
const value: operations.CreateProjectEnvRequestBody2[] = [
  {
    key: "API_URL",
    value: "https://api.vercel.com",
    type: "plain",
    target: [
      "preview",
    ],
    gitBranch: "feature-1",
    comment: "database connection string for production",
  },
];
```

