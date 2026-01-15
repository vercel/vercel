# Legacy Handler Mode Implementation

## Overview

This document describes the legacy handler mode implementation in the Vercel Go builder, covering specs 029 and 030. Legacy handler mode is the original compilation pattern for single-file Go handlers that use `package main` without Go modules.

## Detection Pattern (Spec 030)

The builder distinguishes between legacy handler mode and modern wrapper mode based on:

### 1. Package Name Analysis

The builder uses `analyze.go` to parse the entrypoint's AST and extract:

- Package name
- Exported handler function name

**File**: `/packages/go/analyze.go`

```go
// Searches for the first exported function with http.HandlerFunc signature
// Returns JSON: {"packageName": "...", "functionName": "..."}
```

Detection logic in `/packages/go/src/index.ts`:

```typescript
const analyzed = await getAnalyzedEntrypoint({
  entrypoint,
  modulePath: goModPath ? dirname(goModPath) : undefined,
  workPath,
});

const packageName = analyzed.packageName;

// Line 247: Mode selection
if (packageName === 'main') {
  await buildHandlerAsPackageMain(buildOptions);
} else {
  await buildHandlerWithGoMod(buildOptions);
}
```

### 2. Mode Decision Matrix

| Package Name         | Has go.mod | Mode                    | Notes                                                       |
| -------------------- | ---------- | ----------------------- | ----------------------------------------------------------- |
| `main`               | No         | **Legacy Handler Mode** | Original single-file pattern                                |
| `main`               | Yes        | **Error**               | Throws: "Please change `package main` to `package handler`" |
| `handler` (or other) | No         | Go Mod Mode             | Creates default go.mod                                      |
| `handler` (or other) | Yes        | Go Mod Mode             | Uses existing go.mod                                        |

**Key constraint** (line 188-190):

```typescript
if (goModPath && packageName === 'main') {
  throw new Error('Please change `package main` to `package handler`');
}
```

## Legacy Handler Mode Compilation (Spec 029)

### Handler File Requirements

A valid legacy handler must:

1. Use `package main`
2. Export a function with `http.HandlerFunc` signature:
   - Takes `(http.ResponseWriter, *http.Request)` parameters
   - Has no receiver (not a method)
   - Is exported (capitalized name)

Example from test fixtures:

```go
package cowsay

import (
    "fmt"
    "net/http"
    "github.com/dhruvbird/go-cowsay"
)

// Handler function
func Handler(w http.ResponseWriter, r *http.Request) {
    fmt.Fprintf(w, say.Format("cow:" + runtime.Version()))
}
```

### Compilation Process

**Function**: `buildHandlerAsPackageMain()` (lines 449-492)

#### Step 1: Analyze Entrypoint

```typescript
const analyzed = await getAnalyzedEntrypoint({
  entrypoint,
  modulePath: goModPath ? dirname(goModPath) : undefined,
  workPath,
});
// Returns: { packageName: "main", functionName: "Handler" }
```

**AST Parser** (`analyze.go` lines 110-159):

- Parses the Go file's AST
- Looks for exported functions
- Validates `http.HandlerFunc` signature by checking:
  - Parameter types contain `http.ResponseWriter` and `*http.Request`
  - Exactly 2 parameters
  - No receiver (not a method)

#### Step 2: Rename Handler Function

To avoid naming conflicts when multiple handlers exist:

```typescript
// Line 194-207
const handlerFunctionName = getNewHandlerFunctionName(
  originalFunctionName,
  entrypoint
);

await renameHandlerFunction(
  entrypointAbsolute,
  originalFunctionName,
  handlerFunctionName
);
```

**Renaming strategy** (line 527):

```typescript
const pathSlug = entrypoint.replace(/(\s|\\|\/|\]|\[|-|\.)/g, '_');
const newHandlerName = `${originalFunctionName}_${pathSlug}`;
// Example: "Handler" in "api/index.go" becomes "Handler_api_index_go"
```

**Rename implementation** (lines 494-507):

```typescript
async function renameHandlerFunction(fsPath: string, from: string, to: string) {
  let fileContents = await readFile(fsPath, 'utf8');

  // Regex matches: space + functionName + word boundary
  // Catches: "func Handler(", "var _ http.HandlerFunc = Handler"
  const fromRegex = new RegExp(String.raw` ${from}\b`, 'g');
  fileContents = fileContents.replace(fromRegex, ` ${to}`);

  await writeFile(fsPath, fileContents);
}
```

#### Step 3: Generate main.go Wrapper

Creates `main__vc__go__.go` in the same directory as the entrypoint:

```typescript
// Line 459-463
await writeEntrypoint(
  join(entrypointDirname, MAIN_GO_FILENAME),
  '', // Empty package name for legacy mode
  handlerFunctionName
);
```

**Template** (`/packages/go/main.go`):

```go
package main

import (
    "net/http"
    "os"
    "syscall"

    "__VC_HANDLER_PACKAGE_NAME"  // Empty in legacy mode
    vc "github.com/vercel/go-bridge/go/bridge"
)

func checkForLambdaWrapper() {
    wrapper := os.Getenv("AWS_LAMBDA_EXEC_WRAPPER")
    if wrapper == "" {
        return
    }

    os.Setenv("AWS_LAMBDA_EXEC_WRAPPER", "")
    argv := append([]string{wrapper}, os.Args...)
    err := syscall.Exec(wrapper, argv, os.Environ())
    if err != nil {
        panic(err)
    }
}

func main() {
    checkForLambdaWrapper()
    vc.Start(http.HandlerFunc(__VC_HANDLER_FUNC_NAME))
}
```

In legacy mode:

- `__VC_HANDLER_PACKAGE_NAME` is replaced with empty string (no import)
- `__VC_HANDLER_FUNC_NAME` is replaced with the renamed handler function name

#### Step 4: Fetch Dependencies

```typescript
// Line 472-478
debug('Running `go get`...');
try {
  await go.get();
} catch (err) {
  console.error('Failed to `go get`');
  throw err;
}
```

**Key behavior**:

- `go get` parses all `*.go` files in the current directory (set via `cwd`)
- Downloads packages referenced in `import` statements
- Does NOT use Go modules (GO111MODULE is OFF or not set)

#### Step 5: Build Binary

```typescript
// Line 480-491
debug('Running `go build`...');
const destPath = join(outDir, HANDLER_FILENAME);
try {
  const src = [
    join(entrypointDirname, MAIN_GO_FILENAME),
    entrypointAbsolute,
  ].map(file => normalize(file));
  await go.build(src, destPath);
} catch (err) {
  console.error('failed to `go build`');
  throw err;
}
```

**Build command** (from `go-helpers.ts` line 207-215):

```typescript
build(src: string | string[], dest: string) {
  debug(`Building optimized 'go' binary ${src} -> ${dest}`);
  const sources = Array.isArray(src) ? src : [src];

  const envGoBuildFlags = (this.env || this.opts.env).GO_BUILD_FLAGS;
  const flags = envGoBuildFlags ? stringArgv(envGoBuildFlags) : GO_FLAGS;

  return this.execute('build', ...flags, '-o', dest, ...sources);
}
```

Default flags: `['-ldflags', '-s -w']` (strip debug info and symbol table)

**Actual command**:

```bash
go build -ldflags "-s -w" -o bootstrap main__vc__go__.go entrypoint.go
```

#### Step 6: Cleanup

The undo system restores the filesystem after build (lines 540-573):

```typescript
async function cleanupFileSystem({
  fileActions,
  directoryCreation,
  functionRenames,
}: UndoActions) {
  // Restore files in reverse order
  for (const action of fileActions.reverse()) {
    if (action.to) {
      await move(action.from, action.to, { overwrite: true });
    } else {
      await remove(action.from);
    }
  }

  // Restore function names
  for (const rename of functionRenames) {
    await renameHandlerFunction(rename.fsPath, rename.from, rename.to);
  }

  // Remove empty directories
  // ...
}
```

### Directory Structure Example

**Before build**:

```
api/
  index.go  (package main, func Handler)
```

**During build** (temporary):

```
api/
  index.go  (package main, func Handler_api_index_go)
  main__vc__go__.go  (generated wrapper)
```

**After build** (restored):

```
api/
  index.go  (package main, func Handler)

.vercel/output/functions/api/index.func/
  bootstrap  (compiled binary)
```

## Key Differences: Legacy vs Go Mod Mode

| Aspect                | Legacy Handler Mode              | Go Mod Mode                              |
| --------------------- | -------------------------------- | ---------------------------------------- |
| Package name          | `main`                           | Any except `main` (typically `handler`)  |
| go.mod                | Must NOT exist                   | Can exist (or created automatically)     |
| Handler location      | Same directory as entrypoint     | Moved to subdirectory (e.g., `handler/`) |
| Import in main.go     | None (same package)              | Imports user package                     |
| Dependency management | `go get` (GOPATH style)          | `go mod tidy`                            |
| Build command         | `go build main.go entrypoint.go` | `go build main.go` (with module)         |
| Function reference    | Direct function name             | `packageName.FunctionName`               |

## Environment Variables

Legacy mode respects:

- `GO_BUILD_FLAGS`: Custom build flags (overrides default `-ldflags '-s -w'`)
- `GOARCH`: Target architecture (default: `amd64`)
- `GOOS`: Target OS (default: `linux`)
- `GOROOT`: Go installation path
- `PATH`: Executable search path

## Special Cases

### 1. Square Bracket Entrypoints

Files starting with `[` are renamed (line 81-91):

```typescript
function getRenamedEntrypoint(entrypoint: string): string | undefined {
  const filename = basename(entrypoint);
  if (filename.startsWith('[')) {
    const newEntrypoint = entrypoint.replace('/[', '/now-bracket[');
    return newEntrypoint;
  }
  return undefined;
}
```

Example: `api/[id].go` → `api/now-bracket[id].go` during build

### 2. Multiple Files in Same Directory

When multiple handlers exist in the same directory, function renaming prevents conflicts:

```
api/
  one.go  (func Handler → Handler_api_one_go)
  two.go  (func Handler → Handler_api_two_go)
```

### 3. includeFiles Configuration

Additional files can be bundled (lines 210-220):

```typescript
const includedFiles: Files = {};
if (config && config.includeFiles) {
  const patterns = Array.isArray(config.includeFiles)
    ? config.includeFiles
    : [config.includeFiles];
  for (const pattern of patterns) {
    const fsFiles = await glob(pattern, entrypointDirname);
    for (const [assetName, asset] of Object.entries(fsFiles)) {
      includedFiles[assetName] = asset;
    }
  }
}
```

## Error Handling

### Invalid Package + go.mod Combination

```typescript
if (goModPath && packageName === 'main') {
  throw new Error('Please change `package main` to `package handler`');
}
```

This prevents ambiguity and enforces migration to Go modules.

### No Exported Handler Function

If `analyze.go` finds no valid handler:

```typescript
if (!analyzed) {
  const err = new Error(
    `Could not find an exported function in "${entrypoint}"
Learn more: https://vercel.com/docs/functions/serverless-functions/runtimes/go
  `
  );
  console.error(err.message);
  throw err;
}
```

## Test Fixtures

Legacy handler mode examples:

- `01-cowsay/index.go` - Basic handler with external dependency
- `09-exported-function/index.go` - Handler with custom function name
- `06-content-type/index.go` - Response headers
- `07-content-length/test*.go` - Multiple handlers

## Output Format

The build produces a Lambda function compatible with AWS Lambda:

```typescript
const lambda = new Lambda({
  files: { ...(await glob('**', outDir)), ...includedFiles },
  handler: HANDLER_FILENAME, // "bootstrap" or "bootstrap.exe"
  runtime, // "provided.al2"
  supportsWrapper: true,
  environment: {},
});
```

## Performance Characteristics

Legacy mode:

- Faster for simple handlers (no module overhead)
- Direct compilation (fewer intermediate steps)
- Suitable for single-file handlers without complex dependencies

Trade-offs:

- No module version management
- No vendor directory support
- Limited to packages available via `go get`
- Cannot use local package structure

## Migration Path

To migrate from legacy mode to Go modules:

1. Change `package main` to `package handler`
2. Create `go.mod`:
   ```bash
   go mod init handler
   ```
3. Update imports if needed
4. The builder will automatically use Go Mod mode

## References

**Source files**:

- `/packages/go/src/index.ts` - Main builder logic
- `/packages/go/src/go-helpers.ts` - Go toolchain wrapper
- `/packages/go/analyze.go` - AST parser for handler detection
- `/packages/go/main.go` - Generated wrapper template

**Specs**:

- Spec 029: Legacy handler mode still works
- Spec 030: Builder distinguishes wrapper mode from legacy handler mode
