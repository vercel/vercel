# Go Runtime Framework Preset Design

This document outlines the design for adding Go as an experimental "runtime" framework preset, similar to Python, Ruby, Rust, and Node.

## Current Runtime Framework Presets Analysis

### Existing Patterns

| Runtime    | Detection                                           | Entrypoint    | Builder            | Runtime Mode   |
| ---------- | --------------------------------------------------- | ------------- | ------------------ | -------------- |
| **Python** | `requirements.txt` OR `pyproject.toml` OR `Pipfile` | `index.py`    | `@vercel/python`   | Lambda wrapper |
| **Ruby**   | `config.ru` AND `Gemfile`                           | `config.ru`   | `@vercel/ruby`     | Lambda wrapper |
| **Rust**   | `Cargo.toml` AND `src/main.rs`                      | `src/main.rs` | `@vercel/rust`     | `executable`   |
| **Node**   | `server.ts` AND `package.json`                      | `server.ts`   | `@vercel/backends` | Lambda wrapper |

### Key Characteristics

All runtime framework presets share:

- `experimental: true` - Feature flagged
- `runtimeFramework: true` - Marks it as a runtime (not a web framework)
- `useRuntime` - Specifies entrypoint source and builder
- `ignoreRuntimes` - Prevents double-processing in `api/` directory
- `defaultRoutes` - Typically routes all traffic to the single function

## Go Runtime Framework Preset Design

### Recommended Approach: `main.go` as Entrypoint

The most Go-idiomatic approach is using `main.go` at the project root:

```typescript
{
  name: 'Go',
  slug: 'go',
  experimental: true,
  runtimeFramework: true,
  logo: 'https://api-frameworks.vercel.sh/framework-logos/go.svg',
  tagline: 'An open-source programming language supported by Google.',
  description: 'A generic Go application deployed as a serverless function.',
  website: 'https://go.dev',
  useRuntime: { src: 'main.go', use: '@vercel/go' },
  ignoreRuntimes: ['@vercel/go'],
  detectors: {
    every: [
      { path: 'go.mod' },
      { path: 'main.go' },
    ],
  },
  settings: {
    installCommand: {
      placeholder: '`go mod download`',
    },
    buildCommand: {
      placeholder: 'None',
      value: null,
    },
    devCommand: {
      placeholder: '`go run .`',
      value: null,
    },
    outputDirectory: {
      value: 'N/A',
    },
  },
  getOutputDirName: async () => 'public',
  defaultRoutes: [
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/' },
  ],
}
```

### Detection Logic Rationale

**Why `go.mod` + `main.go`?**

1. **`go.mod`** - Indicates a Go module project (modern Go standard since Go 1.11)
2. **`main.go`** - The conventional entry point for Go applications

This combination ensures:

- We don't match projects using the legacy GOPATH mode
- We identify standalone Go applications (not just function handlers)
- We follow Go's standard project structure conventions

### Alternative Detection Options Considered

#### Option A: Dynamic Detection (like `cmd/server/main.go`)

```typescript
detectors: {
  every: [
    { path: 'go.mod' },
  ],
  some: [
    { path: 'main.go' },
    { path: 'cmd/server/main.go' },
    { path: 'cmd/main.go' },
  ],
}
```

**Pros:**

- Supports the `cmd/` pattern common in larger Go projects
- More flexible

**Cons:**

- Complex entrypoint resolution
- Ambiguous when multiple `main.go` files exist
- The `cmd/` pattern typically builds multiple binaries

#### Option B: Explicit `server.go` (like Node's `server.ts`)

```typescript
detectors: {
  every: [
    { path: 'go.mod' },
    { path: 'server.go' },
  ],
}
```

**Pros:**

- Explicit, no ambiguity
- Consistent with Node's `server.ts` convention

**Cons:**

- Not idiomatic Go (Go uses `main.go` by convention)
- Requires users to rename their entry file

### Recommended: Option A with `main.go` Primary

The **recommended approach** is `main.go` at root, which is the most common and idiomatic Go project structure.

## Changes Required to `@vercel/go`

### Current `@vercel/go` Behavior

The current `@vercel/go` package is designed for the **serverless function pattern**:

1. Expects `package handler` (not `package main`)
2. Requires an exported HTTP handler function: `func Handler(w http.ResponseWriter, r *http.Request)`
3. Wraps the handler with `github.com/vercel/go-bridge` for Lambda compatibility
4. Each `.go` file in `api/` becomes a separate function

### New Mode: Standalone HTTP Server

For the runtime framework preset, `@vercel/go` needs a new mode supporting standalone Go HTTP servers:

#### Detection of Mode

```typescript
// In build function
const isStandaloneServer =
  entrypoint === 'main.go' && packageName === 'main' && !hasExportedHandler;
```

#### Build Process for Standalone Server

```typescript
async function buildStandaloneServer(
  options: BuildOptions
): Promise<BuildResult> {
  const { files, entrypoint, workPath, config, meta } = options;

  // 1. Download files
  await download(files, workPath, meta);

  // 2. Get Go wrapper
  const go = await createGo({ modulePath: workPath, workPath });

  // 3. Build the binary (cross-compile for Linux)
  const outDir = await getWriteableDirectory();
  const binaryPath = join(outDir, 'bootstrap');

  await go.build('.', binaryPath); // Build the entire module

  // 4. Create Lambda with executable runtime
  const lambda = new Lambda({
    files: {
      bootstrap: new FileFsRef({ mode: 0o755, fsPath: binaryPath }),
    },
    handler: 'bootstrap',
    runtime: 'executable',
    runtimeLanguage: 'go',
    supportsResponseStreaming: true,
  });

  return { output: lambda };
}
```

### Required Server Contract

The Go application must:

1. Listen on the port specified by the `PORT` environment variable
2. Implement proper graceful shutdown handling
3. Be a standard `net/http` compatible server

**Example Go Server:**

```go
package main

import (
    "log"
    "net/http"
    "os"
)

func main() {
    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }

    http.HandleFunc("/", handler)

    log.Printf("Server listening on port %s", port)
    log.Fatal(http.ListenAndServe(":"+port, nil))
}

func handler(w http.ResponseWriter, r *http.Request) {
    w.Write([]byte("Hello, World!"))
}
```

## Implementation Plan

### Phase 1: Framework Preset Definition

Add the Go framework preset to `packages/frameworks/src/frameworks.ts`:

```typescript
{
  name: 'Go',
  slug: 'go',
  experimental: true,
  runtimeFramework: true,
  logo: 'https://api-frameworks.vercel.sh/framework-logos/go.svg',
  tagline: 'An open-source programming language supported by Google.',
  description: 'A generic Go application deployed as a serverless function.',
  website: 'https://go.dev',
  useRuntime: { src: 'main.go', use: '@vercel/go' },
  ignoreRuntimes: ['@vercel/go'],
  detectors: {
    every: [
      { path: 'go.mod' },
      { path: 'main.go' },
    ],
  },
  settings: {
    installCommand: {
      placeholder: '`go mod download`',
    },
    buildCommand: {
      placeholder: 'None',
      value: null,
    },
    devCommand: {
      placeholder: '`go run .`',
      value: null,
    },
    outputDirectory: {
      value: 'N/A',
    },
  },
  getOutputDirName: async () => 'public',
  defaultRoutes: [
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/' },
  ],
}
```

### Phase 2: Modify `@vercel/go` Package

#### 2.1 Add Standalone Server Detection

In `packages/go/src/index.ts`:

```typescript
function isStandaloneServer(analyzed: Analyzed, entrypoint: string): boolean {
  return (
    entrypoint === 'main.go' &&
    analyzed.packageName === 'main' &&
    !analyzed.functionName // No exported HTTP handler
  );
}
```

#### 2.2 Update Build Function

```typescript
export async function build(options: BuildOptions) {
  const { entrypoint, workPath } = options;

  // ... existing setup code ...

  const analyzed = await getAnalyzedEntrypoint({
    entrypoint,
    modulePath,
    workPath,
  });

  if (isStandaloneServer(analyzed, entrypoint)) {
    return buildStandaloneServer(options);
  }

  // ... existing handler-based build logic ...
}
```

#### 2.3 Implement `buildStandaloneServer`

```typescript
async function buildStandaloneServer(
  options: BuildOptions
): Promise<BuildResultV3> {
  const { files, entrypoint, workPath, config, meta } = options;

  await download(files, workPath, meta);

  const { goModPath } = await findGoModPath(workPath, workPath);
  const modulePath = goModPath ? dirname(goModPath) : undefined;

  const env = cloneEnv(process.env, meta?.env, {
    GOARCH: 'amd64',
    GOOS: 'linux',
    CGO_ENABLED: '0',
  });

  const go = await createGo({
    modulePath,
    opts: { cwd: workPath, env },
    workPath,
  });

  const outDir = await getWriteableDirectory();
  const binaryPath = join(outDir, 'bootstrap');

  // Build entire module
  await go.build('.', binaryPath);

  const includedFiles: Files = {};
  if (config?.includeFiles) {
    const patterns = Array.isArray(config.includeFiles)
      ? config.includeFiles
      : [config.includeFiles];
    for (const pattern of patterns) {
      const fsFiles = await glob(pattern, workPath);
      Object.assign(includedFiles, fsFiles);
    }
  }

  const lambda = new Lambda({
    files: {
      ...includedFiles,
      bootstrap: new FileFsRef({ mode: 0o755, fsPath: binaryPath }),
    },
    handler: 'bootstrap',
    runtime: 'executable',
    runtimeLanguage: 'go',
    supportsResponseStreaming: true,
    environment: {},
  });

  return { output: lambda };
}
```

#### 2.4 Update `analyze.go` to Detect Standalone Servers

Modify the analyzer to also detect if the file is a standalone server (has `func main()` but no exported HTTP handler):

```go
type analyze struct {
    PackageName      string `json:"packageName"`
    FuncName         string `json:"functionName"`
    Watch            []string `json:"watch"`
    IsStandaloneMain bool   `json:"isStandaloneMain"` // NEW
}

// In main():
// Check if this is package main with func main() but no HTTP handler
if parsed.Name.Name == "main" {
    hasMainFunc := false
    for _, decl := range parsed.Decls {
        fn, ok := decl.(*ast.FuncDecl)
        if ok && fn.Name.Name == "main" && fn.Recv == nil {
            hasMainFunc = true
            break
        }
    }

    if hasMainFunc && !foundHandler {
        analyzed := analyze{
            PackageName:      "main",
            IsStandaloneMain: true,
        }
        // Output and exit
    }
}
```

### Phase 3: Dev Server Support

For `vercel dev`, the standalone server mode should:

1. Run `go run .` in the project directory
2. Wait for the server to start on the specified port
3. Proxy requests to the running server

```typescript
export async function startDevServer(
  opts: StartDevServerOptions
): Promise<StartDevServerResult> {
  const { entrypoint, workPath, meta } = opts;

  // Detect standalone mode
  const analyzed = await getAnalyzedEntrypoint({
    entrypoint,
    modulePath,
    workPath,
  });

  if (isStandaloneServer(analyzed, entrypoint)) {
    return startStandaloneDevServer(opts);
  }

  // ... existing dev server logic ...
}

async function startStandaloneDevServer(
  opts: StartDevServerOptions
): Promise<StartDevServerResult> {
  const { workPath, meta } = opts;
  const port = await getAvailablePort();

  const env = cloneEnv(process.env, meta?.env, {
    PORT: String(port),
  });

  const child = spawn('go', ['run', '.'], {
    cwd: workPath,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  // Wait for server to be ready
  await waitForPort(port);

  return { port, pid: child.pid! };
}
```

## Comparison: Go Serverless Function vs Go Runtime Framework

| Aspect            | Serverless Function (`api/*.go`) | Runtime Framework (`main.go`) |
| ----------------- | -------------------------------- | ----------------------------- |
| Package           | `package handler`                | `package main`                |
| Entry             | Exported `func Handler(w, r)`    | `func main()`                 |
| Routing           | One function per file            | Application handles routing   |
| Server            | go-bridge wrapper                | Native `net/http`             |
| Use case          | Simple API endpoints             | Full web applications         |
| Framework support | N/A                              | Gin, Chi, Echo, Fiber, etc.   |

## Framework-Specific Presets (Future)

Similar to how FastAPI/Flask supersede Python, we could add Go framework presets:

```typescript
{
  name: 'Gin',
  slug: 'gin',
  supersedes: ['go'],
  useRuntime: { src: 'main.go', use: '@vercel/go' },
  detectors: {
    every: [
      { path: 'go.mod' },
      { path: 'main.go' },
    ],
    some: [
      { path: 'go.mod', matchContent: 'github.com/gin-gonic/gin' },
    ],
  },
  // ...
}
```

## Summary

### Recommended Detection

- **Files Required**: `go.mod` AND `main.go`
- **Entrypoint**: `main.go`
- **Runtime**: `@vercel/go` (with new standalone server mode)

### Why This is Idiomatic

1. **`main.go`** is the standard convention for Go's main entry point
2. **`go.mod`** is required for all modern Go projects
3. **`package main`** with `func main()` is how Go applications start
4. The server reads `PORT` from environment (12-factor app standard)

### Changes to `@vercel/go`

1. **Add standalone server detection** - Detect `package main` without exported handler
2. **Add standalone build mode** - Build binary and use `executable` runtime
3. **Update analyzer** - Detect standalone main functions
4. **Add standalone dev server** - Run `go run .` with PORT env var
