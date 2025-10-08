# @vercel/edge

## 1.2.2

### Patch Changes

- This package was introduced to add helpful methods related to Edge Functions. ([#13381](https://github.com/vercel/vercel/pull/13381))

  Nowadays, as much as Node.js and Edge support the same primitives, there is no necessity to continue maintaining a separate package.

  We're going to use [@vercel/functions](https://github.com/vercel/vercel/tree/main/packages/functions) for all the runtimes!

## 1.2.1

### Patch Changes

- fix missing reference to `@vercel/functions` by bundling ([#12831](https://github.com/vercel/vercel/pull/12831))

## 1.2.0

### Minor Changes

- moved methods to @vercel/functions ([#12813](https://github.com/vercel/vercel/pull/12813))

## 1.1.4

### Patch Changes

- [vercel/edge] add geolocation.postalCode ([#12755](https://github.com/vercel/vercel/pull/12755))

## 1.1.3

### Patch Changes

- update "rollup" to resolve vulnerability report ([#12686](https://github.com/vercel/vercel/pull/12686))

## 1.1.2

### Patch Changes

- [edge] deprecate `ipAddress` & `geolocation`. ([#11869](https://github.com/vercel/vercel/pull/11869))

## 1.1.1

### Patch Changes

- bump: edge-runtime ([#10712](https://github.com/vercel/vercel/pull/10712))

## 1.1.0

### Minor Changes

- Add flag to geolocation ([#10443](https://github.com/vercel/vercel/pull/10443))

  Usage

  ```
  const { flag } = geolocation(req)
  ```

## 1.0.2

### Patch Changes

- [node] upgrade edge-runtime ([#10451](https://github.com/vercel/vercel/pull/10451))

## 1.0.1

### Patch Changes

- upgrade edge-runtime ([#10385](https://github.com/vercel/vercel/pull/10385))

## 1.0.0

### Major Changes

- BREAKING CHANGE: Drop Node.js 14, bump minimum to Node.js 16 ([#10369](https://github.com/vercel/vercel/pull/10369))
