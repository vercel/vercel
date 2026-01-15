# includeFiles Configuration Handling in @vercel/go

This document describes how static files are included in the Lambda bundle per Spec 023.

## Overview

The `includeFiles` configuration allows developers to bundle additional static files (templates, config files, assets, etc.) with their Go Lambda functions. These files are matched using glob patterns and included in the final Lambda deployment alongside the compiled Go binary.

## Specification Reference

**Spec 023**: Wrapper mode respects includeFiles config

- **File**: `/Users/gscho/src/vercel/vercel/specs/023-wrapper-respects-includefiles-config.md`
- **Category**: Functional
- **Steps**:
  1. Set includeFiles pattern in vercel.json
  2. Build wrapper mode application
  3. Verify matched files are included in Lambda bundle
  4. Handler can access included files at runtime

## Configuration Syntax

The `includeFiles` configuration can be specified in two ways:

### Single Pattern (String)

```json
{
  "version": 2,
  "builds": [
    {
      "src": "index.go",
      "use": "@vercel/go",
      "config": {
        "includeFiles": "templates/**"
      }
    }
  ]
}
```

### Multiple Patterns (Array)

```json
{
  "version": 2,
  "builds": [
    {
      "src": "index.go",
      "use": "@vercel/go",
      "config": {
        "includeFiles": ["templates/**", "config/*.json", "assets/**"]
      }
    }
  ]
}
```

## Implementation Details

### Source Code Location

- **File**: `/Users/gscho/src/vercel/vercel/packages/go/src/index.ts`
- **Lines**: 209-220 (pattern processing), 254-260 (Lambda creation)

### Processing Flow

#### 1. Pattern Normalization (Lines 209-220)

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

**Key Points**:

- Accepts both string and array formats
- Normalizes single string to array for uniform processing
- Uses `@vercel/build-utils` `glob()` function for pattern matching
- Patterns are resolved relative to `entrypointDirname` (the directory containing the Go entrypoint file)
- Results are stored as `Files` objects (maps of file paths to file metadata)

#### 2. Lambda Bundle Creation (Lines 254-260)

```typescript
const runtime = await getProvidedRuntime();
const lambda = new Lambda({
  files: { ...(await glob('**', outDir)), ...includedFiles },
  handler: HANDLER_FILENAME,
  runtime,
  supportsWrapper: true,
  environment: {},
});
```

**Key Points**:

- The Lambda `files` property combines two sources:
  1. **Compiled output**: `glob('**', outDir)` - the compiled Go binary and any build artifacts
  2. **Included files**: `includedFiles` - the static files matched by includeFiles patterns
- The spread operator (`...`) merges these file sets
- If there are naming conflicts, `includedFiles` takes precedence (rightmost spread wins)
- All files maintain their relative path structure from the entrypoint directory

### Path Resolution

The glob patterns are resolved relative to the **entrypoint directory**, not the workspace root. This means:

```
project/
├── api/
│   ├── handler.go         (entrypoint)
│   ├── templates/
│   │   └── foo.txt
│   └── config/
│       └── settings.json
└── vercel.json
```

If `handler.go` is the entrypoint, patterns are resolved from `api/`:

- `templates/**` matches `api/templates/foo.txt`
- `config/*.json` matches `api/config/settings.json`

## Test Fixture Analysis

### Location

`/Users/gscho/src/vercel/vercel/packages/go/test/fixtures/08-include-files/`

### Files

#### Configuration: `now.json`

```json
{
  "version": 2,
  "builds": [
    {
      "src": "index.go",
      "use": "@vercel/go",
      "config": {
        "includeFiles": ["templates/**"]
      }
    },
    {
      "src": "another.go",
      "use": "@vercel/go",
      "config": {
        "includeFiles": "templates/**"
      }
    }
  ],
  "probes": [
    {
      "path": "/",
      "mustContain": "foobar from file"
    },
    {
      "path": "/another.go",
      "mustContain": "another text file"
    }
  ]
}
```

**Demonstrates**:

- Both array syntax (`["templates/**"]`) and string syntax (`"templates/**"`)
- Multiple builds with different entrypoints sharing the same pattern
- Runtime verification via probes

#### Handler: `index.go`

```go
package cowsay

import (
	"fmt"
	"io/ioutil"
	"net/http"
)

// Handler function
func Handler(w http.ResponseWriter, r *http.Request) {
	bts, err := ioutil.ReadFile("templates/foo.txt")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
	fmt.Fprintf(w, string(bts))
}
```

#### Handler: `another.go`

```go
package cowsay

import (
	"fmt"
	"io/ioutil"
	"net/http"
)

// Handler function
func HandlerAnother(w http.ResponseWriter, r *http.Request) {
	bts, err := ioutil.ReadFile("templates/another.txt")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
	fmt.Fprintf(w, string(bts))
}
```

#### Static Files

- `templates/foo.txt`: Contains `"foobar from file"`
- `templates/another.txt`: Contains `"another text file"`

**Runtime Behavior**:

- Go handlers use `ioutil.ReadFile()` with relative paths
- Files are accessible at runtime in the Lambda execution environment
- The working directory during Lambda execution is the Lambda root, so `templates/foo.txt` resolves correctly

## Key Characteristics

### Pattern Matching

- Uses standard glob syntax (e.g., `**`, `*`, `?`, `[...]`)
- Powered by `@vercel/build-utils` glob function
- Supports multiple patterns via array syntax

### Path Preservation

- Matched files maintain their directory structure relative to the entrypoint directory
- Example: `templates/foo.txt` remains at `templates/foo.txt` in the Lambda

### Merge Behavior

- Included files are merged with compiled output files
- No deduplication warnings - later files silently override earlier ones
- Pattern order matters within the array (later patterns can override earlier ones)

### Runtime Access

- Files are accessible via standard filesystem operations in Go
- Use relative paths from the Lambda root
- No special API required - just use `os.Open()`, `ioutil.ReadFile()`, etc.

## Build Process Integration

The includeFiles processing happens during the `build()` function:

1. **Download Phase**: Source files are downloaded to `downloadPath`
2. **Analysis Phase**: Entrypoint is analyzed to determine package structure
3. **Include Files Phase** (Lines 209-220): Glob patterns are evaluated and files collected
4. **Build Phase**: Go binary is compiled to `outDir`
5. **Lambda Creation Phase** (Lines 254-260): Compiled binary and included files are merged into Lambda bundle
6. **Return Phase**: Lambda is returned as build output

## Error Handling

The current implementation has minimal explicit error handling for includeFiles:

- Invalid glob patterns may cause the glob() function to throw
- Non-existent patterns silently match zero files (no error)
- Relative paths outside the entrypoint directory may behave unexpectedly

## Performance Considerations

- Each pattern is globbed sequentially (not parallelized)
- All matched files are loaded into memory as `Files` objects
- Large numbers of included files will increase Lambda bundle size
- Bundle size affects cold start performance

## Use Cases

### Template Files

```json
{
  "includeFiles": "templates/**"
}
```

For HTML templates, text templates, or any template engine files.

### Configuration Files

```json
{
  "includeFiles": ["config/*.json", "config/*.yaml"]
}
```

For JSON/YAML configuration that needs to be read at runtime.

### Static Assets

```json
{
  "includeFiles": "assets/**"
}
```

For images, fonts, or other static assets served by the Lambda.

### Multiple Directories

```json
{
  "includeFiles": ["templates/**", "locales/**", "schemas/**"]
}
```

For including files from multiple directories.

## Limitations

1. **No Exclusion Patterns**: Cannot exclude files from a broad match (e.g., can't do `templates/** !templates/internal/**`)
2. **No Path Remapping**: Files maintain their original structure; cannot rename or reorganize
3. **No Compression Hints**: No way to specify which files should be compressed
4. **Entrypoint Directory Only**: Patterns are relative to the entrypoint directory, not configurable
5. **No Validation**: No warnings if patterns match zero files or if very large files are included

## Related Files

- **Main Implementation**: `/Users/gscho/src/vercel/vercel/packages/go/src/index.ts`
- **Test Fixture**: `/Users/gscho/src/vercel/vercel/packages/go/test/fixtures/08-include-files/`
- **Specification**: `/Users/gscho/src/vercel/vercel/specs/023-wrapper-respects-includefiles-config.md`
- **Build Utils Types**: `/Users/gscho/src/vercel/vercel/packages/build-utils/src/types.ts` (Config interface)

## Summary

The includeFiles configuration provides a simple, declarative way to bundle static files with Go Lambda functions. It uses glob patterns resolved relative to the entrypoint directory, merges matched files with the compiled binary, and makes them available at runtime through standard filesystem operations. The implementation is straightforward, with minimal error handling and no advanced features like exclusions or path remapping.
