# @vercel/python

## 6.13.0

### Minor Changes

- Add runtime dependency install to support larger Python functions ([#14976](https://github.com/vercel/vercel/pull/14976))

  This adds logic to calculate the total size of a lambda at build time and offload dependencies
  to a \_runtime_requirements.txt file so they can be installed at runtime by uv. This allows us to
  deploy functions up to the total size of the /tmp folder.

## 6.12.0

### Minor Changes

- [services] synchronize dependencies in dev mode for JS/TS and Python services ([#14987](https://github.com/vercel/vercel/pull/14987))

### Patch Changes

- log contents of malformed manifests ([#15019](https://github.com/vercel/vercel/pull/15019))

- Updated dependencies [[`a960cf23a42ff1a570c808ee9567670c24422f98`](https://github.com/vercel/vercel/commit/a960cf23a42ff1a570c808ee9567670c24422f98)]:
  - @vercel/python-analysis@0.4.1

## 6.11.1

### Patch Changes

- [python] preserve error code on uv error ([#14990](https://github.com/vercel/vercel/pull/14990))

## 6.11.0

### Minor Changes

- Use python-analysis for manifest detection and conversion ([#14956](https://github.com/vercel/vercel/pull/14956))

- [services] detect and manage virtual environments for Python services ([#14952](https://github.com/vercel/vercel/pull/14952))

### Patch Changes

- Updated dependencies [[`9b8f974bbb64fb857b068428b0c2fdccee6ad83c`](https://github.com/vercel/vercel/commit/9b8f974bbb64fb857b068428b0c2fdccee6ad83c)]:
  - @vercel/python-analysis@0.4.0

## 6.10.0

### Minor Changes

- [python] prefer `fastapi dev` to start ASGI application if FastAPI CLI is available and monitor module changes ([#14861](https://github.com/vercel/vercel/pull/14861))

## 6.9.0

### Minor Changes

- [services] add a dev lock for `vercel dev` to prevent launching multiple `vercel dev` processes for a multi-service projects. ([#14897](https://github.com/vercel/vercel/pull/14897))

## 6.8.0

### Minor Changes

- fix a build regression on projects with changed rootDirectory ([#14931](https://github.com/vercel/vercel/pull/14931))

### Patch Changes

- Revert "[python] Use python-analysis for manifest detection and conversion (#14891)" ([#14928](https://github.com/vercel/vercel/pull/14928))

## 6.7.0

### Minor Changes

- Enable standalone runtime unconditionally ([#14876](https://github.com/vercel/vercel/pull/14876))

## 6.6.0

### Minor Changes

- Add multi-service support for `vercel dev`. When `VERCEL_USE_EXPERIMENTAL_SERVICES=1` is set, the CLI auto-detects different multi-service layouts and orchestrates dev servers for each service through a single proxy server. ([#14805](https://github.com/vercel/vercel/pull/14805))

### Patch Changes

- Skip filtering system pythons on local vercel builds. ([#14858](https://github.com/vercel/vercel/pull/14858))

## 6.5.1

### Patch Changes

- switch tests to vitest ([#14853](https://github.com/vercel/vercel/pull/14853))

## 6.5.0

### Minor Changes

- vendor Python runtime dependencies ([#14827](https://github.com/vercel/vercel/pull/14827))

- Bump vercel-runtime version automatically on its releases ([#14842](https://github.com/vercel/vercel/pull/14842))

## 6.4.2

### Patch Changes

- Fix issue when .python-version file is provided without a pyproject.toml ([#14811](https://github.com/vercel/vercel/pull/14811))

## 6.4.1

### Patch Changes

- Preserve error code when re-throwing errors in UvRunner methods ([#14796](https://github.com/vercel/vercel/pull/14796))

## 6.4.0

### Minor Changes

- Enable support for python 3.13 and 3.14 runtimes ([#14740](https://github.com/vercel/vercel/pull/14740))

  Preserves the current behaviour of "falling back" to python3.12 when an unsupported version of python is selected

## 6.3.2

### Patch Changes

- Revert removing pip from the isInstalled check ([#14728](https://github.com/vercel/vercel/pull/14728))

## 6.3.1

### Patch Changes

- isInstalled check only needs to check for python on the path. ([#14712](https://github.com/vercel/vercel/pull/14712))

## 6.3.0

### Minor Changes

- enable standalone python-runtime behind a feature flag ([#14673](https://github.com/vercel/vercel/pull/14673))

### Patch Changes

- Add syncpack to enforce @types/node version consistency across the monorepo. ([#14665](https://github.com/vercel/vercel/pull/14665))

  Update @types/node to 20.11.0 and fix type compatibility issues.

## 6.2.1

### Patch Changes

- [python] experimental python runtime framework preset ([#14646](https://github.com/vercel/vercel/pull/14646))

- Re-enable automatic python installs at build time. ([#14670](https://github.com/vercel/vercel/pull/14670))

## 6.2.0

### Minor Changes

- Support for python 3.13 and 3.14 ([#14601](https://github.com/vercel/vercel/pull/14601))

## 6.1.6

### Patch Changes

- [python] fix handling of ASGI headers in local runtime ([#14513](https://github.com/vercel/vercel/pull/14513))

## 6.1.5

### Patch Changes

- [python] only create api builders for `.py` files that export an app or handler ([#14493](https://github.com/vercel/vercel/pull/14493))

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
