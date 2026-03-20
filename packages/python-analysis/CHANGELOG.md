# @vercel/python-analysis

## 0.10.1

### Patch Changes

- Add `diagnostics` callback to produce package-manifest.json ([#15373](https://github.com/vercel/vercel/pull/15373))

## 0.10.0

### Minor Changes

- Add requirements.txt parsing via `uv-requirements-txt` ([#15498](https://github.com/vercel/vercel/pull/15498))

### Patch Changes

- Stub unicode/IDNA crates to reduce WASM binary size ([#15499](https://github.com/vercel/vercel/pull/15499))

- Force-bundle packages without compatible wheels instead of failing ([#15587](https://github.com/vercel/vercel/pull/15587))

- replace `pip-requirements-js` with WASM-based uv parser ([#15513](https://github.com/vercel/vercel/pull/15513))

## 0.9.1

### Patch Changes

- Update `pip-requirements-js` to include fixes for grouped `requirements.txt` environment markers and add regression coverage for Poetry-style marker expressions. ([#15422](https://github.com/vercel/vercel/pull/15422))

## 0.9.0

### Minor Changes

- [python] add support for module-based entrypoints for cron jobs ([#15393](https://github.com/vercel/vercel/pull/15393))

- For the django frontend, dynamically load settings.py instead of parsing it ([#15367](https://github.com/vercel/vercel/pull/15367))

## 0.8.2

### Patch Changes

- Consolidate Python version resolution into `python-analysis` ([#15368](https://github.com/vercel/vercel/pull/15368))

## 0.8.1

### Patch Changes

- Add `prisma-client-py` support and the quirks system ([#15289](https://github.com/vercel/vercel/pull/15289))

## 0.8.0

### Minor Changes

- Find entrypoints for django projects. ([#15167](https://github.com/vercel/vercel/pull/15167))

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
