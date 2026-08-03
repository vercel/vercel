# @vercel/mcp-adapter

## 1.0.1

### Patch Changes

- Jump past npm `1.0.0` (published from the old standalone `vercel/mcp-adapter` repo). Monorepo was still on `0.3.x` while `latest` pointed at `0.3.2`, so publishing `0.3.3` failed: npm refuses to apply `latest` when a higher version already exists.

## 0.3.3

### Patch Changes

- 6d7fbfa: Bump all workspace packages to trigger a full publish from vercel-internal.

## 0.3.2

### Patch Changes

- Fix .repository field in package.json to make it possible to publish ([#14997](https://github.com/vercel/vercel/pull/14997))
