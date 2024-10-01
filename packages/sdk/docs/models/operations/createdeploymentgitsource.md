# CreateDeploymentGitSource


## Supported Types

### `operations.GitSource1`

```typescript
const value: operations.GitSource1 = {
  type: "github",
  repoId: "<id>",
};
```

### `operations.GitSource2`

```typescript
const value: operations.GitSource2 = {
  type: "github",
  org: "<value>",
  repo: "<value>",
};
```

### `operations.GitSource3`

```typescript
const value: operations.GitSource3 = {
  type: "gitlab",
  projectId: "<id>",
};
```

### `operations.GitSource4`

```typescript
const value: operations.GitSource4 = {
  type: "bitbucket",
  repoUuid: "<id>",
};
```

### `operations.GitSource5`

```typescript
const value: operations.GitSource5 = {
  type: "bitbucket",
  owner: "<value>",
  slug: "<value>",
};
```

### `operations.CreateDeploymentGitSource6`

```typescript
const value: operations.CreateDeploymentGitSource6 = {
  type: "custom",
  ref: "<value>",
  sha: "<value>",
  gitUrl: "https://salty-unique.net",
};
```

### `operations.CreateDeploymentGitSource7`

```typescript
const value: operations.CreateDeploymentGitSource7 = {
  type: "github",
  ref: "<value>",
  sha: "<value>",
  repoId: 7811.93,
};
```

### `operations.CreateDeploymentGitSource8`

```typescript
const value: operations.CreateDeploymentGitSource8 = {
  type: "gitlab",
  ref: "<value>",
  sha: "<value>",
  projectId: 1689.26,
};
```

### `operations.CreateDeploymentGitSource9`

```typescript
const value: operations.CreateDeploymentGitSource9 = {
  type: "bitbucket",
  ref: "<value>",
  sha: "<value>",
  workspaceUuid: "<id>",
  repoUuid: "<id>",
};
```

