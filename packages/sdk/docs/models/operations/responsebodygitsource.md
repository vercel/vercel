# ResponseBodyGitSource


## Supported Types

### `operations.GetDeploymentGitSource1`

```typescript
const value: operations.GetDeploymentGitSource1 = {
  type: "github",
  repoId: "<id>",
};
```

### `operations.GetDeploymentGitSource2`

```typescript
const value: operations.GetDeploymentGitSource2 = {
  type: "github",
  org: "<value>",
  repo: "<value>",
};
```

### `operations.GetDeploymentGitSource3`

```typescript
const value: operations.GetDeploymentGitSource3 = {
  type: "gitlab",
  projectId: "<id>",
};
```

### `operations.GetDeploymentGitSource4`

```typescript
const value: operations.GetDeploymentGitSource4 = {
  type: "bitbucket",
  repoUuid: "<id>",
};
```

### `operations.GetDeploymentGitSource5`

```typescript
const value: operations.GetDeploymentGitSource5 = {
  type: "bitbucket",
  owner: "<value>",
  slug: "<value>",
};
```

### `operations.GetDeploymentGitSource6`

```typescript
const value: operations.GetDeploymentGitSource6 = {
  type: "custom",
  ref: "<value>",
  sha: "<value>",
  gitUrl: "https://another-testing.net",
};
```

### `operations.GetDeploymentGitSource7`

```typescript
const value: operations.GetDeploymentGitSource7 = {
  type: "github",
  ref: "<value>",
  sha: "<value>",
  repoId: 5525.81,
};
```

### `operations.GetDeploymentGitSource8`

```typescript
const value: operations.GetDeploymentGitSource8 = {
  type: "gitlab",
  ref: "<value>",
  sha: "<value>",
  projectId: 8518.09,
};
```

### `operations.GetDeploymentGitSource9`

```typescript
const value: operations.GetDeploymentGitSource9 = {
  type: "bitbucket",
  ref: "<value>",
  sha: "<value>",
  workspaceUuid: "<id>",
  repoUuid: "<id>",
};
```

