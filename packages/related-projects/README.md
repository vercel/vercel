# `@vercel/related-projects`

Utilities for stitching together Vercel deployments across multiple projects.

## Usage

### Install

`pnpm add @vercel/related-projects`

### Configure related projects

```json filename=vercel.json
{
  "relatedProjects": ["prj_123", "prj_456"]
}
```

## Retrieve related projects data

```ts
import { relatedProjects } from '@vercel/related-projects';

// fully typed env variable
const projects = relatedProjects();
```

### Reference hosts of related projects

```ts
import { withRelatedProject } from '@vercel/related-projects';

const apiHost = withRelatedProject({
  projectName: 'my-api-project',
  // used as a fallback
  defaultHost: process.env.API_HOST,
});
```

This can replace all usages of:

```ts
const apiHost = process.env.API_HOST;
```

### Access related projects types

```ts
import type { VercelRelatedProject } from '@vercel/related-projects';
```
