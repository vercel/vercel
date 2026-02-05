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

### Supported Project Structures

We support the most common Go project layouts:

#### Pattern 1: Simple Projects - `main.go` at root

```
myproject/
├── go.mod
├── main.go        ← Entry point
├── handler.go
└── ...
```

Best for: Small projects, simple APIs, learning/prototyping.

#### Pattern 2: Standard Layout - `cmd/api/` or `cmd/server/`

```
myproject/
├── go.mod
├── cmd/
│   └── api/
│       └── main.go    ← API server entry point
├── internal/
└── pkg/
```

Best for: Production applications following the [Standard Go Project Layout](https://github.com/golang-standards/project-layout).

### Framework Preset Definition

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
    ],
    some: [
      { path: 'main.go' },
      { path: 'cmd/api/main.go' },
      { path: 'cmd/server/main.go' },
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
      placeholder: '`go run .` or `go run ./cmd/api`',
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

### Entrypoint Resolution

Simple priority-based resolution:

| Priority | Path                 | Rationale                              |
| -------- | -------------------- | -------------------------------------- |
| 1        | `main.go`            | Simplest case, unambiguous             |
| 2        | `cmd/api/main.go`    | Most relevant for Vercel (API servers) |
| 3        | `cmd/server/main.go` | Common convention for HTTP servers     |

**Implementation:**

```typescript
const SUPPORTED_ENTRYPOINTS = [
  'main.go',
  'cmd/api/main.go',
  'cmd/server/main.go',
];

async function resolveEntrypoint(workPath: string): Promise<string> {
  for (const entry of SUPPORTED_ENTRYPOINTS) {
    if (await pathExists(join(workPath, entry))) {
      debug(`Resolved Go entrypoint: ${entry}`);
      return entry;
    }
  }

  throw new Error(
    'No Go entrypoint found. Expected one of: main.go, cmd/api/main.go, or cmd/server/main.go'
  );
}
```

### Why These Three Paths?

1. **`main.go`** - The standard Go convention for simple projects
2. **`cmd/api/main.go`** - Most relevant for Vercel's use case (API servers)
3. **`cmd/server/main.go`** - Common alternative naming for HTTP servers

This covers the vast majority of Go web applications while keeping the implementation simple and predictable.

### Future Enhancements

If user feedback indicates demand, we could add:

- `cmd/web/main.go` - Web application convention
- `cmd/app/main.go` - Generic application
- Content-based validation (regex check for HTTP server patterns)
- Explicit configuration via `vercel.json`

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
    ],
    some: [
      { path: 'main.go' },
      { path: 'cmd/api/main.go' },
      { path: 'cmd/server/main.go' },
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
      placeholder: '`go run .` or `go run ./cmd/api`',
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

#### 2.1 Add Entrypoint Resolution

In `packages/go/src/index.ts`:

```typescript
const SUPPORTED_ENTRYPOINTS = [
  'main.go',
  'cmd/api/main.go',
  'cmd/server/main.go',
];

async function resolveEntrypoint(workPath: string): Promise<string> {
  for (const entry of SUPPORTED_ENTRYPOINTS) {
    if (await pathExists(join(workPath, entry))) {
      debug(`Resolved Go entrypoint: ${entry}`);
      return entry;
    }
  }

  throw new Error(
    'No Go entrypoint found. Expected one of: main.go, cmd/api/main.go, or cmd/server/main.go'
  );
}
```

#### 2.2 Add Standalone Server Detection

```typescript
function isStandaloneServer(analyzed: Analyzed, entrypoint: string): boolean {
  // Standalone server: package main with no exported HTTP handler
  return (
    analyzed.packageName === 'main' && !analyzed.functionName // No exported HTTP handler function
  );
}
```

#### 2.3 Update Build Function

```typescript
export async function build(options: BuildOptions) {
  let { entrypoint, workPath } = options;

  // For runtime framework mode, resolve the actual entrypoint
  if (entrypoint === 'main.go') {
    entrypoint = await resolveEntrypoint(workPath);
  }

  // ... existing setup code ...

  const analyzed = await getAnalyzedEntrypoint({
    entrypoint,
    modulePath,
    workPath,
  });

  if (isStandaloneServer(analyzed, entrypoint)) {
    return buildStandaloneServer(options, entrypoint);
  }

  // ... existing handler-based build logic ...
}
```

#### 2.4 Implement `buildStandaloneServer`

```typescript
async function buildStandaloneServer(
  options: BuildOptions,
  resolvedEntrypoint: string
): Promise<BuildResultV3> {
  const { files, workPath, config, meta } = options;

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

  // Determine build target based on entrypoint location
  // - main.go at root: build '.'
  // - cmd/api/main.go: build './cmd/api'
  const buildTarget =
    resolvedEntrypoint === 'main.go' ? '.' : './' + dirname(resolvedEntrypoint);

  debug(`Building standalone server: ${buildTarget}`);
  await go.build(buildTarget, binaryPath);

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

#### 2.5 Update `analyze.go` to Detect Standalone Servers

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

1. Resolve the actual entrypoint (main.go or cmd/\*/main.go)
2. Run `go run <target>` in the project directory
3. Wait for the server to start on the specified port
4. Proxy requests to the running server

```typescript
export async function startDevServer(
  opts: StartDevServerOptions
): Promise<StartDevServerResult> {
  let { entrypoint, workPath, meta } = opts;

  // Resolve actual entrypoint for runtime framework mode
  if (entrypoint === 'main.go') {
    entrypoint = await resolveEntrypoint(workPath);
  }

  // Detect standalone mode
  const analyzed = await getAnalyzedEntrypoint({
    entrypoint,
    modulePath,
    workPath,
  });

  if (isStandaloneServer(analyzed, entrypoint)) {
    return startStandaloneDevServer(opts, entrypoint);
  }

  // ... existing dev server logic ...
}

async function startStandaloneDevServer(
  opts: StartDevServerOptions,
  resolvedEntrypoint: string
): Promise<StartDevServerResult> {
  const { workPath, meta } = opts;
  const port = await getAvailablePort();

  const env = cloneEnv(process.env, meta?.env, {
    PORT: String(port),
  });

  // Determine run target based on entrypoint location
  // - main.go at root: go run .
  // - cmd/api/main.go: go run ./cmd/api
  const runTarget =
    resolvedEntrypoint === 'main.go' ? '.' : './' + dirname(resolvedEntrypoint);

  debug(`Starting dev server: go run ${runTarget}`);
  const child = spawn('go', ['run', runTarget], {
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

### Supported Entrypoints

- **Required**: `go.mod`
- **Entrypoint (one of)**:
  - `main.go` (simple projects)
  - `cmd/api/main.go` (API servers)
  - `cmd/server/main.go` (HTTP servers)
- **Runtime**: `@vercel/go` (with new standalone server mode)

### Why These Three Paths?

1. **`main.go`** - Standard Go convention for simple projects
2. **`cmd/api/main.go`** - Most relevant for Vercel's use case (API servers)
3. **`cmd/server/main.go`** - Common alternative naming for HTTP servers

This covers the vast majority of Go web applications while keeping the implementation simple and predictable.

### Changes to `@vercel/go`

1. **Add entrypoint resolution** - Check for `main.go`, `cmd/api/main.go`, or `cmd/server/main.go`
2. **Add standalone server detection** - Detect `package main` without exported handler
3. **Add standalone build mode** - Build binary with correct target and use `executable` runtime
4. **Update analyzer** - Detect standalone main functions
5. **Add standalone dev server** - Run `go run <target>` with PORT env var

### Future Enhancements

If user feedback indicates demand:

- `cmd/web/main.go`, `cmd/app/main.go` support
- Content-based validation (regex check for HTTP server patterns)
- Explicit configuration via `vercel.json`
