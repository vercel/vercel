# Save Point: Python Lambda Runtime Dependency Installation

## Project Overview

We're implementing a feature for the Vercel Python runtime (`@vercel/python`) that allows Python AWS Lambda functions to exceed the 250MB uncompressed size limit by deferring public dependency installation to runtime.

## Repository Location

`/Users/gscho/src/vercel/vercel` - Vercel monorepo

## Key Files Modified

### Core Implementation

| File                                 | Purpose                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `packages/python/src/uv.ts`          | UV binary handling, lock file parsing (`parseUvLockFile`, `UvLockPackage`, `UvLockFile` interfaces)                            |
| `packages/python/src/packages.ts`    | **NEW FILE** - Package classification logic (`classifyPackages`, `generateRuntimeRequirements`, `getProjectNameFromPyproject`) |
| `packages/python/src/install.ts`     | Bundle size calculation, vendor mirroring                                                                                      |
| `packages/python/src/index.ts`       | Main build logic - orchestrates runtime install detection and bundling                                                         |
| `packages/python/src/trampoline.ts`  | Template renderer for Python trampoline script                                                                                 |
| `packages/python/trampoline.py.tmpl` | Python trampoline template with runtime install logic                                                                          |

### Test File

| File                                | Purpose                                           |
| ----------------------------------- | ------------------------------------------------- |
| `packages/python/test/unit.test.ts` | Unit tests covering runtime install functionality |

## Current State

### What's Working

1. **Feature flag** - Runtime install is behind `VERCEL_EXPERIMENTAL_PYTHON_UV_INSTALL_ON_STARTUP` environment variable
2. **Bundle size detection** - Detects when bundle > 240MB threshold
3. **Package classification** - Parses `uv.lock` to classify packages as public (PyPI) or private (git, local, private registry)
4. **Project package exclusion** - Reads project name from `pyproject.toml` and excludes it from runtime requirements
5. **UV binary bundling** - Copies uv binary into workPath for correct `FileFsRef` handling
6. **Runtime requirements generation** - Creates `_runtime_requirements.txt` with pinned versions
7. **Trampoline template** - Renders Python bootstrap script with conditional runtime install block
8. **Production logging** - Trampoline includes appropriate logging for debugging (install start/end, cached deps message)

### Ephemeral Storage

**Important**: Ephemeral storage (Lambda /tmp space) is handled via the existing `MAXIMISE_TMP_SPACE` build environment variable. Users who enable runtime dependency installation should also set this flag to ensure sufficient /tmp space for installing dependencies at runtime.

**Required environment variables for this feature:**

```
VERCEL_EXPERIMENTAL_PYTHON_UV_INSTALL_ON_STARTUP=1
MAXIMISE_TMP_SPACE=1
```

## Architecture

```
Build Time:
┌─────────────────────────────────────────────────────────────────┐
│ 1. Install all deps to venv                                     │
│ 2. Mirror to _vendor, calculate size                            │
│ 3. If VERCEL_EXPERIMENTAL_PYTHON_UV_INSTALL_ON_STARTUP=1        │
│    AND size > 240MB:                                            │
│    a. Read project name from pyproject.toml                     │
│    b. Classify packages (public vs private) from uv.lock        │
│    c. Bundle only private packages + vercel-runtime to _vendor  │
│    d. Generate _runtime_requirements.txt (public packages only) │
│    e. Copy uv binary to _uv/uv                                  │
│    f. Render trampoline with runtimeInstallEnabled=true         │
└─────────────────────────────────────────────────────────────────┘

Runtime (Lambda cold start):
┌─────────────────────────────────────────────────────────────────┐
│ 1. Trampoline checks for /tmp/_vc_deps_overflow/.installed      │
│ 2. If not exists (cold start):                                  │
│    a. Log "Installing runtime dependencies..."                  │
│    b. Run: _uv/uv pip install -r _uv/_runtime_requirements.txt  │
│    c. Target: /tmp/_vc_deps_overflow                            │
│    d. Log "Runtime dependencies installed in X.XXs"             │
│    e. Create .installed marker file                             │
│ 3. If exists (warm start):                                      │
│    a. Log "Using cached runtime dependencies"                   │
│ 4. Add /tmp/_vc_deps_overflow to sys.path                       │
│ 5. Add _vendor to sys.path                                      │
│ 6. Import and run handler                                       │
└─────────────────────────────────────────────────────────────────┘
```

## Test Flask App

Location: `/Users/gscho/src/gscho/flask`

Current `pyproject.toml`:

```toml
[project]
name = "app"
version = "0.1.0"
requires-python = "==3.12.*"
dependencies = [
    "scipy==1.12.0",
    "numpy==1.26.4",
    "pandas==2.2.1",
    "matplotlib==3.8.3",
    "pillow==10.2.0",
    "flask",
]
```

Test endpoint: `/api/deps-check` - Returns JSON with status of all dependency imports

## Commands

```bash
# Run tests
cd packages/python && pnpm test-unit

# Type check
cd packages/python && pnpm type-check

# Build
cd packages/python && pnpm build

# Test with Flask app (with feature flags)
cd ~/src/gscho/flask && VERCEL_EXPERIMENTAL_PYTHON_UV_INSTALL_ON_STARTUP=1 MAXIMISE_TMP_SPACE=1 vercel deploy
```

## Key Constants

| Constant                      | Value                    | Location             |
| ----------------------------- | ------------------------ | -------------------- |
| `LAMBDA_SIZE_THRESHOLD_BYTES` | 240MB                    | `install.ts`         |
| `UV_BUNDLE_DIR`               | `_uv`                    | `uv.ts`              |
| Runtime deps dir              | `/tmp/_vc_deps_overflow` | `trampoline.py.tmpl` |

## Edge Cases to Consider

- Network failures during runtime install (PyPI unavailable)
- Very large private packages that still exceed limits
- Warm start behavior verification
- Mixed public/private dependency trees
