# Go Handler Detection and Compilation Patterns

Quick reference for specs 029 and 030.

## Detection Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Parse entrypoint with analyze.go                         │
│    - Extract package name                                   │
│    - Find exported http.HandlerFunc signature               │
└─────────────────────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Check for go.mod in entrypoint directory or parents      │
└─────────────────────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Determine build mode                                     │
│                                                              │
│    ┌──────────────────┬─────────────┬───────────────────┐  │
│    │ Package Name     │ go.mod      │ Mode              │  │
│    ├──────────────────┼─────────────┼───────────────────┤  │
│    │ main             │ No          │ LEGACY HANDLER    │  │
│    │ main             │ Yes         │ ERROR             │  │
│    │ handler/other    │ No/Yes      │ GO MOD MODE       │  │
│    └──────────────────┴─────────────┴───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## AST Analysis (`analyze.go`)

**Valid handler signature detection**:

```go
// Must match ALL conditions:
1. Function is exported (capitalized name)
2. Has exactly 2 parameters
3. Parameters are: (http.ResponseWriter, *http.Request)
4. No receiver (not a method)

// Detection regex patterns:
params := "http.ResponseWriter" && "*http.Request"
len(fn.Type.Params.List) == 2
fn.Recv == nil || len(fn.Recv.List) == 0
```

**Output format**:

```json
{
  "packageName": "main",
  "functionName": "Handler"
}
```

## Legacy Handler Mode Compilation Steps

```
Step 1: Analyze
├─ Parse AST → { packageName: "main", functionName: "Handler" }
└─ Validate http.HandlerFunc signature

Step 2: Rename Handler
├─ Create unique name: Handler_api_index_go
├─ Regex replace in file: / Handler\b/ → / Handler_api_index_go/
└─ Track for undo after build

Step 3: Generate main.go
├─ Template: packages/go/main.go
├─ Replace __VC_HANDLER_PACKAGE_NAME → "" (empty)
├─ Replace __VC_HANDLER_FUNC_NAME → Handler_api_index_go
└─ Write to: main__vc__go__.go

Step 4: Fetch Dependencies
├─ Run: go get (in entrypointDirname)
├─ Parses all *.go files
└─ Downloads import packages (GOPATH style)

Step 5: Build Binary
├─ Sources: [main__vc__go__.go, entrypoint.go]
├─ Command: go build -ldflags "-s -w" -o bootstrap <sources>
└─ Output: bootstrap (or bootstrap.exe on Windows)

Step 6: Cleanup
├─ Restore renamed function
├─ Delete main__vc__go__.go
└─ Remove temporary directories
```

## File Transformations

### Input File

```go
// api/index.go
package main

import (
    "fmt"
    "net/http"
)

func Handler(w http.ResponseWriter, r *http.Request) {
    fmt.Fprintf(w, "Hello")
}
```

### During Build (Temporary)

**Renamed handler** (`api/index.go`):

```go
package main

import (
    "fmt"
    "net/http"
)

func Handler_api_index_go(w http.ResponseWriter, r *http.Request) {
    fmt.Fprintf(w, "Hello")
}
```

**Generated wrapper** (`api/main__vc__go__.go`):

```go
package main

import (
    "net/http"
    "os"
    "syscall"

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
    vc.Start(http.HandlerFunc(Handler_api_index_go))
}
```

### After Build (Restored)

```go
// api/index.go - restored to original
package main

import (
    "fmt"
    "net/http"
)

func Handler(w http.ResponseWriter, r *http.Request) {
    fmt.Fprintf(w, "Hello")
}
```

**Output**:

```
.vercel/output/functions/api/index.func/
  bootstrap  (compiled binary)
```

## Function Renaming Pattern

**Purpose**: Prevent naming conflicts when multiple handlers exist

**Algorithm** (`getNewHandlerFunctionName`):

```typescript
// Replace special chars with underscore
const pathSlug = entrypoint.replace(/(\s|\\|\/|\]|\[|-|\.)/g, '_');

// Combine original name + path slug
const newHandlerName = `${originalFunctionName}_${pathSlug}`;
```

**Examples**:

```
Handler in "index.go"           → Handler_index_go
Handler in "api/user.go"        → Handler_api_user_go
Handler in "[id].go"            → Handler__id__go
H in "some/path-to/file.go"     → H_some_path_to_file_go
```

**Regex replacement**:

```javascript
// Pattern: space + functionName + word boundary
const fromRegex = new RegExp(String.raw` ${from}\b`, 'g');

// Matches in:
func Handler(...)           → func Handler_api_index_go(...)
var _ http.HandlerFunc = Handler → var _ http.HandlerFunc = Handler_api_index_go
return Handler              → return Handler_api_index_go
```

## Mode Distinction Matrix

| Characteristic | Legacy Handler    | Go Mod              | Wrapper (New)    |
| -------------- | ----------------- | ------------------- | ---------------- |
| Package        | `main`            | `handler`/other     | `main`           |
| go.mod         | ❌ Must not exist | ✅ Optional/created | ✅ Optional      |
| Import style   | Same package      | Cross-package       | `vercel/wrapper` |
| main.go        | Generated         | Generated           | User-written     |
| Deps           | `go get`          | `go mod tidy`       | `go mod tidy`    |
| Build          | Multi-file        | Module              | Direct           |

## Error Conditions

### 1. Package main + go.mod

```
if (goModPath && packageName === 'main') {
  throw new Error('Please change `package main` to `package handler`');
}
```

**Reasoning**: Prevents ambiguity. If go.mod exists, use Go modules properly.

### 2. No Exported Handler

```
if (!analyzed) {
  throw new Error(
    `Could not find an exported function in "${entrypoint}"
Learn more: https://vercel.com/docs/functions/serverless-functions/runtimes/go
  `
  );
}
```

**Common causes**:

- Function not exported (lowercase name)
- Wrong signature (not `http.HandlerFunc`)
- Function is a method (has receiver)

## Special Cases

### Square Brackets in Filename

Path segments like `[id].go` are renamed:

```typescript
if (filename.startsWith('[')) {
  newEntrypoint = entrypoint.replace('/[', '/now-bracket[');
}
```

Example: `api/[id].go` → `api/now-bracket[id].go`

### Multiple Handlers in Directory

Each handler gets unique renamed function:

```
api/
  one.go   - Handler → Handler_api_one_go
  two.go   - Handler → Handler_api_two_go
  three.go - MyFunc → MyFunc_api_three_go
```

### Include Files

Additional files bundled via config:

```json
{
  "functions": {
    "api/*.go": {
      "includeFiles": "templates/**"
    }
  }
}
```

## Build Environment

**Set by builder**:

```bash
GOARCH=amd64
GOOS=linux
```

**Configurable**:

```bash
GO_BUILD_FLAGS="-ldflags '-s -w -X main.version=1.0'"
```

**Default flags**:

```bash
-ldflags "-s -w"  # Strip debug info and symbol table
```

## Code Locations

| Feature           | File                       | Lines            |
| ----------------- | -------------------------- | ---------------- |
| Mode detection    | `packages/go/src/index.ts` | 247-251          |
| AST parsing       | `packages/go/analyze.go`   | 110-159          |
| Function renaming | `packages/go/src/index.ts` | 494-507, 509-535 |
| Legacy build      | `packages/go/src/index.ts` | 449-492          |
| main.go template  | `packages/go/main.go`      | 1-32             |
| Cleanup/undo      | `packages/go/src/index.ts` | 540-573          |

## Quick Debugging

**Check what mode will be used**:

```bash
# In the function directory:
grep "^package" *.go  # Check package name
ls go.mod             # Check if go.mod exists

# package main + no go.mod = LEGACY
# package main + go.mod = ERROR
# package handler + * = GO MOD MODE
```

**Common issues**:

1. "Please change package main to package handler"
   → You have go.mod with package main. Either remove go.mod or change package.

2. "Could not find an exported function"
   → Check function signature matches: `func Name(w http.ResponseWriter, r *http.Request)`

3. Build fails with import errors
   → Legacy mode: `go get` may not resolve all deps
   → Solution: Add go.mod and change to `package handler`
