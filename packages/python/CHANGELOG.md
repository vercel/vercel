# @vercel/python

## 6.1.4

### Patch Changes

- [python] add install script to pyproject.toml ([#14420](https://github.com/vercel/vercel/pull/14420))

- [python] uv workspaces fix don't throw on missing `uv.lock` ([#14467](https://github.com/vercel/vercel/pull/14467))

## 6.1.3

### Patch Changes

- [python] fix custom install command ([#14418](https://github.com/vercel/vercel/pull/14418))

- Ensure python install errors retain the error code ([#14452](https://github.com/vercel/vercel/pull/14452))

## 6.1.2

### Patch Changes

- [python] update dependency installation to use a .venv + uv sync ([#14415](https://github.com/vercel/vercel/pull/14415))

## 6.1.1

### Patch Changes

- Use `workspace:*` for workspace dependencies ([#14396](https://github.com/vercel/vercel/pull/14396))

## 6.1.0

### Minor Changes

- Improved error message for missing entrypoint ([#14369](https://github.com/vercel/vercel/pull/14369))

## 6.0.8

### Patch Changes

- [python] uv workspaces support ([#14327](https://github.com/vercel/vercel/pull/14327))

## 6.0.7

### Patch Changes

- [python] flush startup logs atexit ([#14334](https://github.com/vercel/vercel/pull/14334))

## 6.0.6

### Patch Changes

- [python] patch: build commands uv bugfix ([#14303](https://github.com/vercel/vercel/pull/14303))

## 6.0.5

### Patch Changes

- make python version range detection in requires-python in pyproject.toml more robust ([#14258](https://github.com/vercel/vercel/pull/14258))

## 6.0.4

### Patch Changes

- [python] build command support ([#14244](https://github.com/vercel/vercel/pull/14244))

- Adding tests for fast api middleware ([#14236](https://github.com/vercel/vercel/pull/14236))

## 6.0.3

### Patch Changes

- [python] avoid installing dev dependencies ([#14232](https://github.com/vercel/vercel/pull/14232))

- [python] swaps custom http server handler for asgi apps with uvicorn ([#14192](https://github.com/vercel/vercel/pull/14192))

- Exclude JS package manager lock files ([#14233](https://github.com/vercel/vercel/pull/14233))

- [python] surface tracebacks on user code import error ([#14250](https://github.com/vercel/vercel/pull/14250))

## 6.0.2

### Patch Changes

- [python] surface tracebacks on error logs ([#14193](https://github.com/vercel/vercel/pull/14193))

- write to stderr on startup error logs ([#14198](https://github.com/vercel/vercel/pull/14198))

## 6.0.1

### Patch Changes

- [python] allow arbitrary entrypoints in pyproject.toml ([#14181](https://github.com/vercel/vercel/pull/14181))

- [python] update predefined excludes ([#14166](https://github.com/vercel/vercel/pull/14166))

- [python] fix logging ([#14165](https://github.com/vercel/vercel/pull/14165))

## 6.0.0

### Major Changes

- [python] allowing /api folder entrypoints for FastAPI + Flask ([#14168](https://github.com/vercel/vercel/pull/14168))

## 5.0.10

### Patch Changes

- [python] flask start dev server ([#14103](https://github.com/vercel/vercel/pull/14103))

- [python] streaming e2e tests ([#14103](https://github.com/vercel/vercel/pull/14103))

## 5.0.9

### Patch Changes

- reverts fastapi background task commit ([#14074](https://github.com/vercel/vercel/pull/14074))

## 5.0.8

### Patch Changes

- [python] FastAPI background tasks bugfix, enhanced probes and fixture ([#14050](https://github.com/vercel/vercel/pull/14050))

- [python] flask zero-config ([#14055](https://github.com/vercel/vercel/pull/14055))

## 5.0.7

### Patch Changes

- [python] fixes logging categorization ([#14035](https://github.com/vercel/vercel/pull/14035))

- [python] better build logging ([#14026](https://github.com/vercel/vercel/pull/14026))

## 5.0.6

### Patch Changes

- [python] switch build pip install step to prefer uv ([#14027](https://github.com/vercel/vercel/pull/14027))

- [python] FastAPI background task support ([#14011](https://github.com/vercel/vercel/pull/14011))

- [python] relative paths in requirements.txt fix ([#14022](https://github.com/vercel/vercel/pull/14022))

- [python] Use static builder for /public for FastAPI ([#14027](https://github.com/vercel/vercel/pull/14027))

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
