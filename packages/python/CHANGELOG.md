# @vercel/python

## 5.0.5

### Patch Changes

- [python] switch build pip install step to prefer uv ([#13953](https://github.com/vercel/vercel/pull/13953))

## 5.0.4

### Patch Changes

- [python]: move python packages vendor dir out of /cache ([#13921](https://github.com/vercel/vercel/pull/13921))

## 5.0.3

### Patch Changes

- [python] FastAPI entrypoint discovery ([#13914](https://github.com/vercel/vercel/pull/13914))

## 5.0.2

### Patch Changes

- Vercel build command on python projects installs dependencies into vendor dir instead of project root. ([#13884](https://github.com/vercel/vercel/pull/13884))

## 5.0.1

### Patch Changes

- fix(python): Avoid uploading pycache ([#13909](https://github.com/vercel/vercel/pull/13909))

## 5.0.0

### Major Changes

- By default, the Python builder excludes certain directories from the zip output. ([#13609](https://github.com/vercel/vercel/pull/13609))
  In vercel.json it's also possible to specify a custom `excludeFiles` rule.
  Previously `excludeFiles` would replace the default exclusions entirely. Now the
  default exclusions will always apply. The default exclusions consist of:

  - .git
  - .vercel
  - .pnpm-store
  - node_modules (also excluded when nested)
  - .next
  - .nuxt

## 4.8.0

### Minor Changes

- Improve Fluid support ([#13589](https://github.com/vercel/vercel/pull/13589))

## 4.7.4

### Patch Changes

- Ignore .pnpm_store in Python lambdas ([#13568](https://github.com/vercel/vercel/pull/13568))

## 4.7.3

### Patch Changes

- Reverting support for `preferredRegion` ([#13566](https://github.com/vercel/vercel/pull/13566))

## 4.7.2

### Patch Changes

- Fix bug in WSGI streaming ([#13213](https://github.com/vercel/vercel/pull/13213))

## 4.7.1

### Patch Changes

- Remove support for VERCEL_IPC_FD ([#12908](https://github.com/vercel/vercel/pull/12908))

- Add `supportsResponseStreaming` to build output ([#12884](https://github.com/vercel/vercel/pull/12884))

## 4.7.0

### Minor Changes

- Add support for in-function concurrency ([#12850](https://github.com/vercel/vercel/pull/12850))

## 4.6.0

### Minor Changes

- Update default ignored folders from the zip output: ([#12813](https://github.com/vercel/vercel/pull/12813))

  - nested `node_modules`
  - nested `.next` & `.nuxt`
  - `.git` & `.vercel`

### Patch Changes

- Support VERCEL_IPC_PATH along with VERCEL_IPC_FD ([#12813](https://github.com/vercel/vercel/pull/12813))

## 4.5.1

### Patch Changes

- Fix ASGI response streaming ([#12610](https://github.com/vercel/vercel/pull/12610))

## 4.5.0

### Minor Changes

- Report Request Metrics when using urllib3/requests ([#12580](https://github.com/vercel/vercel/pull/12580))

## 4.4.1

### Patch Changes

- Use a ThreadingHTTPServer to handle concurrent requests ([#12578](https://github.com/vercel/vercel/pull/12578))

## 4.4.0

### Minor Changes

- Add support for HTTP streaming ([#12557](https://github.com/vercel/vercel/pull/12557))

## 4.3.1

### Patch Changes

- Improvements to "fasthtml" framework preset ([#11900](https://github.com/vercel/vercel/pull/11900))

## 4.3.0

### Minor Changes

- support newer python versions ([#11675](https://github.com/vercel/vercel/pull/11675))

## 4.2.0

### Minor Changes

- Add support for Python 3.12 ([#11478](https://github.com/vercel/vercel/pull/11478))

## 4.1.1

### Patch Changes

- Remove deprecated `createLambda()` usage ([#11080](https://github.com/vercel/vercel/pull/11080))

## 4.1.0

### Minor Changes

- Add support for pip3.10 and pip3.11 ([#10648](https://github.com/vercel/vercel/pull/10648))

## 4.0.2

### Patch Changes

- Fix docs URL in error message ([#10544](https://github.com/vercel/vercel/pull/10544))

## 4.0.1

### Patch Changes

- Update to esbuild script ([#10470](https://github.com/vercel/vercel/pull/10470))

## 4.0.0

### Major Changes

- BREAKING CHANGE: Drop Node.js 14, bump minimum to Node.js 16 ([#10369](https://github.com/vercel/vercel/pull/10369))
