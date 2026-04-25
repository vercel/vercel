# @vercel/python

## 6.36.0

### Minor Changes

- Add framework to package manifest for python and backends builders. ([#16072](https://github.com/vercel/vercel/pull/16072))

### Patch Changes

- Don't pass --python 3.0 to uv venv when running vc dev ([#16072](https://github.com/vercel/vercel/pull/16072))

## 6.35.0

### Minor Changes

- [services] move Python workers to v2beta triggers with private routing ([#15920](https://github.com/vercel/vercel/pull/15920))

## 6.34.0

### Minor Changes

- Generate PROJECTMANIFEST in @vercel/backends for Node deployments. ([#15991](https://github.com/vercel/vercel/pull/15991))

## 6.33.3

### Patch Changes

- [experimental-services] add new job service type support ([#15944](https://github.com/vercel/vercel/pull/15944))

## 6.33.2

### Patch Changes

- Update the error for custom installCommand builds >250MB. ([#15946](https://github.com/vercel/vercel/pull/15946))

## 6.33.1

### Patch Changes

- Enable functions beta hint when flag is true ([#15965](https://github.com/vercel/vercel/pull/15965))

- [services] don't catch all routes for non-web Python services ([#15960](https://github.com/vercel/vercel/pull/15960))

- Remove duplicated error message. ([#16000](https://github.com/vercel/vercel/pull/16000))

## 6.33.0

### Minor Changes

- Fix local builds when pinned Python version is not on PATH. ([#15897](https://github.com/vercel/vercel/pull/15897))

- Support dynamically specifying crons from a python service ([#15930](https://github.com/vercel/vercel/pull/15930))

## 6.32.0

### Minor Changes

- Add a new flag to vercel deploy to let users deploy to hive ([#15892](https://github.com/vercel/vercel/pull/15892))

## 6.31.0

### Minor Changes

- Parse python module:variable entrypoint notation in experimentalServices for all service types. ([#15844](https://github.com/vercel/vercel/pull/15844))

### Patch Changes

- [python] set the `UV_PROJECT_ENVIRONMENT` and `UV_NO_DEV` env vars so that custom `installCommand` and `buildCommand` commands can be called without the `--active` and `--no-dev` flags ([#15715](https://github.com/vercel/vercel/pull/15715))

## 6.30.1

### Patch Changes

- Replace subprocess calls with fs.existsSync ([#15913](https://github.com/vercel/vercel/pull/15913))

## 6.30.0

### Minor Changes

- Enable caching for python builds using prepareCache ([#15634](https://github.com/vercel/vercel/pull/15634))

## 6.29.0

### Minor Changes

- Simplify and streamline python builder logic ([#15696](https://github.com/vercel/vercel/pull/15696))

- Fix django static file serving for manifest storage backends. ([#15709](https://github.com/vercel/vercel/pull/15709))

- [django] Don't exclude the /static directory when using staticfiles ([#15705](https://github.com/vercel/vercel/pull/15705))

- [django] Only look at STATICFILES_STORAGE value when on a django that supports it ([#15706](https://github.com/vercel/vercel/pull/15706))

- Produce a better diagnostic when Django settings discovery fails ([#15770](https://github.com/vercel/vercel/pull/15770))

### Patch Changes

- Always make the path name for a python service be `/index` ([#15773](https://github.com/vercel/vercel/pull/15773))

## 6.28.0

### Minor Changes

- Update uv to v0.10.11 ([#15623](https://github.com/vercel/vercel/pull/15623))

- Simplify python runtime by always passing in app variable ([#15635](https://github.com/vercel/vercel/pull/15635))

### Patch Changes

- Fix env marker-excluded deps erroneously flagged as lacking wheels ([#15668](https://github.com/vercel/vercel/pull/15668))

- Updated dependencies [[`ac87d5a5ef5d79b55765e094efc957de987d7ac4`](https://github.com/vercel/vercel/commit/ac87d5a5ef5d79b55765e094efc957de987d7ac4), [`25a6a2daa46baba6e8d7dec90eb49213b8150b8c`](https://github.com/vercel/vercel/commit/25a6a2daa46baba6e8d7dec90eb49213b8150b8c)]:
  - @vercel/python-analysis@0.11.0

## 6.27.0

### Minor Changes

- Ensure django static files are copied in build output. ([#15557](https://github.com/vercel/vercel/pull/15557))

## 6.26.0

### Minor Changes

- Fix building python projects with pyproject.toml but no python-version ([#15554](https://github.com/vercel/vercel/pull/15554))

### Patch Changes

- Add a small buffer to the final lambda size check. ([#15663](https://github.com/vercel/vercel/pull/15663))

## 6.25.0

### Minor Changes

- Make specifying a different entry point variable actually work ([#15614](https://github.com/vercel/vercel/pull/15614))

### Patch Changes

- [services] allow services to share builder source ([#15631](https://github.com/vercel/vercel/pull/15631))

- [python] update celery worker services declaration to support broker_url="vercel://" instead of having to import from vercel.workers.celery ([#15454](https://github.com/vercel/vercel/pull/15454))

- Add `diagnostics` callback to produce package-manifest.json ([#15373](https://github.com/vercel/vercel/pull/15373))

- Run the typechecker ([#15558](https://github.com/vercel/vercel/pull/15558))

- Updated dependencies [[`8e8110d2eca5832e109f5efb64b192690100927d`](https://github.com/vercel/vercel/commit/8e8110d2eca5832e109f5efb64b192690100927d)]:
  - @vercel/python-analysis@0.10.1

## 6.24.0

### Minor Changes

- [services] add support for background workers to vc dev ([#15434](https://github.com/vercel/vercel/pull/15434))

- Fix serving static files for a django WSGI app in vercel dev. ([#15501](https://github.com/vercel/vercel/pull/15501))

- [services] add support for cron services to vc dev ([#15433](https://github.com/vercel/vercel/pull/15433))

### Patch Changes

- Use LAMBDA_SIZE_THRESHOLD_BYTES to determine remaining capacity. ([#15596](https://github.com/vercel/vercel/pull/15596))

- [services] increase Python startup timeout to 5 minutes to match orchestrator ([#15535](https://github.com/vercel/vercel/pull/15535))

- Force-bundle packages without compatible wheels instead of failing ([#15587](https://github.com/vercel/vercel/pull/15587))

- Updated dependencies [[`3c4355fa1414aa3270ba4d36423aa647d49a9cf3`](https://github.com/vercel/vercel/commit/3c4355fa1414aa3270ba4d36423aa647d49a9cf3), [`267223f86eb578cc740db501fb2c2cbf43a27b37`](https://github.com/vercel/vercel/commit/267223f86eb578cc740db501fb2c2cbf43a27b37), [`e9a791d0fa04ef58695535fa508554415137fb58`](https://github.com/vercel/vercel/commit/e9a791d0fa04ef58695535fa508554415137fb58), [`12811e7bc827900d534aa25f5f3e2331a80ca6a8`](https://github.com/vercel/vercel/commit/12811e7bc827900d534aa25f5f3e2331a80ca6a8)]:
  - @vercel/python-analysis@0.10.0

## 6.23.0

### Minor Changes

- Run Django's `collectstatic` during Vercel builds, serving static files from the CDN and excluding them from the Lambda bundle. ([#15391](https://github.com/vercel/vercel/pull/15391))

### Patch Changes

- Leave 10mb of space for src code before packing lambda. ([#15475](https://github.com/vercel/vercel/pull/15475))

## 6.22.1

### Patch Changes

- Revert the prepareCache python implementation. ([#15470](https://github.com/vercel/vercel/pull/15470))

## 6.22.0

### Minor Changes

- [python] move vc_init_dev into vercel-runtime ([#15419](https://github.com/vercel/vercel/pull/15419))

### Patch Changes

- Updated dependencies [[`a67131396956632b060895afe44b26bb99941817`](https://github.com/vercel/vercel/commit/a67131396956632b060895afe44b26bb99941817)]:
  - @vercel/python-analysis@0.9.1

## 6.21.0

### Minor Changes

- [python] add support for module-based entrypoints for cron jobs ([#15393](https://github.com/vercel/vercel/pull/15393))

- Avoid doing entry point detection on every request to a python dev server ([#15365](https://github.com/vercel/vercel/pull/15365))

- For the django frontend, dynamically load settings.py instead of parsing it ([#15367](https://github.com/vercel/vercel/pull/15367))

### Patch Changes

- speed up python entrypoint detection ([#15402](https://github.com/vercel/vercel/pull/15402))

- Add Python builder cache preparation for Build Output API v3 cache globs, the builder virtualenv, and the repo-local uv cache. ([#15407](https://github.com/vercel/vercel/pull/15407))

- Updated dependencies [[`83e804013528fc54de31082960ae31f58339bd71`](https://github.com/vercel/vercel/commit/83e804013528fc54de31082960ae31f58339bd71), [`921314f958c4ec85adb09e020310a5becb7f866c`](https://github.com/vercel/vercel/commit/921314f958c4ec85adb09e020310a5becb7f866c)]:
  - @vercel/python-analysis@0.9.0

## 6.20.2

### Patch Changes

- Consolidate Python version resolution into `python-analysis` ([#15368](https://github.com/vercel/vercel/pull/15368))

- Updated dependencies [[`d1c4d7052033aaf7b3f2044aa24484cb143b9348`](https://github.com/vercel/vercel/commit/d1c4d7052033aaf7b3f2044aa24484cb143b9348)]:
  - @vercel/python-analysis@0.8.2

## 6.20.1

### Patch Changes

- Add background worker service support for Python (Dramatiq/Celery) and propagate vercel headers context to worker handlers. ([#15361](https://github.com/vercel/vercel/pull/15361))

## 6.20.0

### Minor Changes

- Add traces to python builder. ([#15282](https://github.com/vercel/vercel/pull/15282))

### Patch Changes

- Add no install project flag to the predeploy uv sync command ([#15341](https://github.com/vercel/vercel/pull/15341))

- Move the matplotlib env var to quirks. ([#15305](https://github.com/vercel/vercel/pull/15305))

## 6.19.0

### Minor Changes

- [python] setup logging in `vc_init_dev` to route records with level <= `WARNING` to `stdout` and with level >= `ERROR` to `stderr`. ([#15328](https://github.com/vercel/vercel/pull/15328))

## 6.18.1

### Patch Changes

- add litellm proxy support ([#15313](https://github.com/vercel/vercel/pull/15313))

## 6.18.0

### Minor Changes

- Run Python build commands _after_ install commands and in the virtual env ([#15171](https://github.com/vercel/vercel/pull/15171))

### Patch Changes

- Add `prisma-client-py` support and the quirks system ([#15289](https://github.com/vercel/vercel/pull/15289))

- Updated dependencies [[`3880e1028840aae6883211b79a1a30c7432580f3`](https://github.com/vercel/vercel/commit/3880e1028840aae6883211b79a1a30c7432580f3)]:
  - @vercel/python-analysis@0.8.1

## 6.17.0

### Minor Changes

- Find entrypoints for django projects. ([#15167](https://github.com/vercel/vercel/pull/15167))

### Patch Changes

- Rename fetch to nodeFetch when importing from node-fetch ([#15232](https://github.com/vercel/vercel/pull/15232))

- [services] fix dev server hang when FastAPI CLI is used ([#15274](https://github.com/vercel/vercel/pull/15274))

- [python] fix dev server crash on relative imports ([#15269](https://github.com/vercel/vercel/pull/15269))

- Updated dependencies [[`b3a96cc4f276ce8d16c695eabd499d3a17e73aa8`](https://github.com/vercel/vercel/commit/b3a96cc4f276ce8d16c695eabd499d3a17e73aa8)]:
  - @vercel/python-analysis@0.8.0

## 6.16.1

### Patch Changes

- Disable runtime dependency installs for projects with custom build/install commands ([#15240](https://github.com/vercel/vercel/pull/15240))

## 6.16.0

### Minor Changes

- [python] add support for running generic ASGI/WSGI applications to vc dev ([#15174](https://github.com/vercel/vercel/pull/15174))

### Patch Changes

- Updated dependencies [[`cb79f6f8080fddd3673a8911566085e0265b060b`](https://github.com/vercel/vercel/commit/cb79f6f8080fddd3673a8911566085e0265b060b)]:
  - @vercel/python-analysis@0.7.0

## 6.15.1

### Patch Changes

- Check if file exists before mirroring into vendor ([#15181](https://github.com/vercel/vercel/pull/15181))

## 6.15.0

### Minor Changes

- Optimize cold starts for lambdas >250MB ([#15080](https://github.com/vercel/vercel/pull/15080))

  1. Remove `uv pip install` and replace it with `uv sync --inexact --frozen`
  2. Pack the lambda zip with dependencies up to 245MB then only install the remaining ones at runtime

### Patch Changes

- Updated dependencies [[`fc56fb91b4dafabe0f68f86efeabbaf98b2642bc`](https://github.com/vercel/vercel/commit/fc56fb91b4dafabe0f68f86efeabbaf98b2642bc)]:
  - @vercel/python-analysis@0.6.0

## 6.14.1

### Patch Changes

- Skip runtime dependency install logic when VERCEL_PYTHON_ON_HIVE is set ([#15111](https://github.com/vercel/vercel/pull/15111))

- Use dist-info RECORD to properly manage installed Python dependencies ([#15083](https://github.com/vercel/vercel/pull/15083))

- Updated dependencies [[`88353afe588b95709af20ba2b82ba83d8a60f90c`](https://github.com/vercel/vercel/commit/88353afe588b95709af20ba2b82ba83d8a60f90c)]:
  - @vercel/python-analysis@0.5.0

## 6.14.0

### Minor Changes

- Enable runtime dependency installs for lambdas >250MB in size ([#15082](https://github.com/vercel/vercel/pull/15082))

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
