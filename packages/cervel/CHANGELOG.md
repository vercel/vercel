# @vercel/cervel

## 0.0.11

### Patch Changes

- Improve handling of cjs/esm interop during imports ([#14730](https://github.com/vercel/vercel/pull/14730))

## 0.0.10

### Patch Changes

- Add syncpack to enforce @types/node version consistency across the monorepo. ([#14665](https://github.com/vercel/vercel/pull/14665))

  Update @types/node to 20.11.0 and fix type compatibility issues.

## 0.0.9

### Patch Changes

- Cleanup esbuild and rolldown dependencies ([#14577](https://github.com/vercel/vercel/pull/14577))

- Ensure internal build step runs if a build script is missing ([#14564](https://github.com/vercel/vercel/pull/14564))

## 0.0.8

### Patch Changes

- Add support for 'main' entrypoint and search in `dist` for app entrypoint if a build script is provided ([#14550](https://github.com/vercel/vercel/pull/14550))

## 0.0.7

### Patch Changes

- Upgrade rolldown ([#14446](https://github.com/vercel/vercel/pull/14446))

## 0.0.6

### Patch Changes

- Add bun detection for experimental backends ([#14311](https://github.com/vercel/vercel/pull/14311))

## 0.0.5

### Patch Changes

- Add more frameworks to entrypoint detection ([#14299](https://github.com/vercel/vercel/pull/14299))

## 0.0.4

### Patch Changes

- Fix build issue with experimental backends builder ([#14281](https://github.com/vercel/vercel/pull/14281))

## 0.0.3

### Patch Changes

- Move tsdown to dev dep ([#14157](https://github.com/vercel/vercel/pull/14157))

## 0.0.2

### Patch Changes

- Add experimental external package for backend build and dev logic ([#14065](https://github.com/vercel/vercel/pull/14065))

- Replace experimental builders for Express and Hono with a @vercel/backends package ([#14065](https://github.com/vercel/vercel/pull/14065))
