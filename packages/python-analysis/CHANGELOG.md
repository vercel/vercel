# @vercel/python-analysis

## 0.7.0

### Minor Changes

- Add django experimental framework. ([#15196](https://github.com/vercel/vercel/pull/15196))

## 0.6.0

### Minor Changes

- Optimize cold starts for lambdas >250MB ([#15080](https://github.com/vercel/vercel/pull/15080))

  1. Remove `uv pip install` and replace it with `uv sync --inexact --frozen`
  2. Pack the lambda zip with dependencies up to 245MB then only install the remaining ones at runtime

## 0.5.0

### Minor Changes

- Use dist-info RECORD to properly manage installed Python dependencies ([#15083](https://github.com/vercel/vercel/pull/15083))

## 0.4.1

### Patch Changes

- log contents of malformed manifests ([#15019](https://github.com/vercel/vercel/pull/15019))

## 0.4.0

### Minor Changes

- Use python-analysis for manifest detection and conversion ([#14956](https://github.com/vercel/vercel/pull/14956))

## 0.3.2

### Patch Changes

- Revert "[python] Use python-analysis for manifest detection and conversion (#14891)" ([#14928](https://github.com/vercel/vercel/pull/14928))

## 0.3.1

### Patch Changes

- fix ESM/CJS cross-compatibility ([#14869](https://github.com/vercel/vercel/pull/14869))

## 0.3.0

### Minor Changes

- initial implementation of Python semantic analysis in Rust ([#14690](https://github.com/vercel/vercel/pull/14690))

## 0.2.0

### Minor Changes

- use vitest instead of jest for testing ([#14681](https://github.com/vercel/vercel/pull/14681))

## 0.1.1

### Patch Changes

- Fix release ([#14591](https://github.com/vercel/vercel/pull/14591))
