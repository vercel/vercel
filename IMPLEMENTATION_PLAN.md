# Go Wrapper Mode Implementation Plan

## Executive Summary

This document outlines the prioritized implementation plan for adding wrapper mode support to Vercel's Go runtime. The wrapper mode allows users to write standard Go HTTP servers using `package main` with any router (stdlib, Gin, Chi, gorilla/mux) and have them automatically work as Vercel serverless functions.

**Current State (as of Phase 1 completion):**

- `go/` module: **IMPLEMENTED** - Core wrapper runtime with `Start()`, Lambda event handling, and unit tests
- Builder (`packages/go/`): Legacy handler mode only - **NO wrapper detection**
- Analyzer (`packages/go/analyze.go`): Only detects `http.HandlerFunc` signature - **NO import scanning for `github.com/vercel/vercel-go`**
- Dev server (`packages/go/dev-server.go`): Direct handler mode only - **NO wrapper mode support**
- `packages/go/src/index.ts`: Currently **throws error** for `package main` + `go.mod` ("Please change `package main` to `package handler`")
- Specs 001-004, 015-020, 026-028: **IMPLEMENTED** (runtime level)
- Remaining specs require builder integration

**Target State:**

- Full wrapper runtime in `go/` bridging Lambda events to `http.Handler`
- Builder support for detecting and compiling wrapper mode projects
- Full backwards compatibility with existing handler mode projects

---

## Implementation Status Summary

| Component                   | Status          | Details                                                     |
| --------------------------- | --------------- | ----------------------------------------------------------- |
| `go/vercel.go`              | **COMPLETE**    | Start function with environment detection                   |
| `go/lambda.go`              | **COMPLETE**    | Lambda event handling, request/response conversion          |
| `go/lambda_test.go`         | **COMPLETE**    | 10 test functions, all passing                              |
| `packages/go/analyze.go`    | PARTIAL         | Only detects `http.HandlerFunc`, no wrapper import scanning |
| `packages/go/src/index.ts`  | NOT IMPLEMENTED | Errors on `package main` + `go.mod`, no wrapper mode path   |
| `packages/go/dev-server.go` | NOT IMPLEMENTED | No wrapper mode support                                     |
| Test fixtures (wrapper-\*)  | NOT IMPLEMENTED | None exist                                                  |
| Documentation               | NOT IMPLEMENTED | No README or migration guide                                |

---

## Implementation Checklist (Priority Order)

### Phase 1: Core Wrapper Runtime (`go/`) - **COMPLETE**

**Status: All items implemented and tested**

#### 1.1 Main Entry Point (`go/vercel.go`) - **COMPLETE**

- [x] **Create `Start(handler http.Handler)` function** - IMPLEMENTED

  - Primary API for wrapper mode users
  - Accepts any `http.Handler` implementation (stdlib, Gin, Chi, gorilla/mux)
  - Detect runtime environment and route to appropriate mode
  - _Specs: 011, 012, 013, 014_

- [x] **Implement Lambda environment detection** - IMPLEMENTED (Spec 001)

  - Check `AWS_LAMBDA_FUNCTION_NAME` environment variable
  - If present: start Lambda handler mode
  - If absent: start local HTTP server mode

- [x] **Implement local HTTP server mode** - IMPLEMENTED (Spec 004)
  - Start `http.Server` on `PORT` env var (default 3000)
  - For `vercel dev` and local testing

#### 1.2 Lambda Event Handling (`go/lambda.go`) - **COMPLETE**

- [x] **Add `github.com/aws/aws-lambda-go` dependency to `go/go.mod`** - IMPLEMENTED

  - Version 1.52.0 added via `go mod tidy`

- [x] **Implement Lambda handler registration** - IMPLEMENTED

  - Uses `lambda.Start()` with custom handler function

- [x] **Convert APIGatewayProxyRequest to http.Request** - IMPLEMENTED (Specs 002, 015-017, 026-028)

  - Parse HTTP method, path, headers from event
  - Reconstruct URL with path parameters (Spec 026)
  - Parse and include query parameters (Spec 027)
  - Preserve all request headers including `Host` (Spec 015)
  - Handle request body with base64 decoding (Specs 016, 017)
  - Set `RemoteAddr` from `X-Forwarded-For` header (Spec 028)

- [x] **Convert http.Response to APIGatewayProxyResponse** - IMPLEMENTED (Specs 003, 018-020)

  - Use `httptest.NewRecorder()` to capture response
  - Extract status code (Spec 019)
  - Extract all response headers (Spec 018)
  - Base64 encode binary responses (Spec 020)

- [x] **Handle multi-value headers** - IMPLEMENTED
  - Supports both `MultiValueHeaders` and single-value `Headers`

#### 1.3 Unit Tests (`go/lambda_test.go`) - **COMPLETE**

- [x] **Create unit tests for request conversion** - IMPLEMENTED

  - `TestConvertEventToRequest`: HTTP method, path, host, body
  - `TestQueryParameters`: Single and multi-value query parameters
  - `TestRequestHeaders`: Single and multi-value headers
  - `TestRemoteAddrFromXFF`: X-Forwarded-For extraction
  - `TestPathParameters`: Path preservation for routers

- [x] **Create unit tests for response conversion** - IMPLEMENTED

  - `TestConvertResponseToEvent`: Status codes 200, 201, 400, 404, 500
  - `TestBinaryResponse`: Base64 encoding for binary content
  - `TestIsBinaryContentType`: 25 content type tests

- [x] **Integration test** - IMPLEMENTED
  - `TestLambdaHandlerIntegration`: Full request/response cycle
  - `TestIsLambdaEnvironment`: Environment detection

---

### Phase 2: Builder Wrapper Mode Support (`packages/go/`)

**Depends on: Phase 1 completion**

#### 2.1 Wrapper Mode Detection

- [ ] **Add import scanning to `analyze.go`** - NOT IMPLEMENTED (Spec 005)

  - Current state: Only scans for `http.HandlerFunc` signature (lines 110-159)
  - Needed: Extend AST analysis to check import declarations for `github.com/vercel/vercel-go`
  - Needed: Add `UsesWrapper bool` field to output JSON
  - Current output JSON has `packageName` and `functionName` but NO `usesWrapper` field

- [ ] **Support `wrapper: true` in vercel.json config** - NOT IMPLEMENTED (Spec 006)

  - Check `config.wrapper` boolean in build options
  - Either import OR config enables wrapper mode

- [ ] **Update mode detection logic in `index.ts`** - NOT IMPLEMENTED (Spec 030)
  - Current state (line 188-190): Throws error "Please change `package main` to `package handler`" when `package main` + `go.mod` detected
  - Current mode selection (line 247-251): Only supports legacy (`main` without go.mod) or go.mod mode
  - Needed detection priority:
    1. Config `wrapper: true` - wrapper mode
    2. Import `github.com/vercel/vercel-go` detected - wrapper mode
    3. `package handler` with exported `Handler` - legacy handler mode
    4. `package main` without wrapper import - error with helpful message

#### 2.2 Wrapper Mode Build Path (`packages/go/src/index.ts`)

- [ ] **Create `buildHandlerAsWrapperMode()` function** - NOT IMPLEMENTED (Spec 007)

  - Function does not exist
  - Do NOT generate `main.go` - user provides their own
  - Compile user's `main.go` directly with `go build`
  - Output binary as the Lambda bootstrap handler
  - Set `GOOS=linux`, `GOARCH=amd64`

- [ ] **Modify build routing logic** - NOT IMPLEMENTED

  - Add wrapper mode check before existing handler mode checks
  - Route to `buildHandlerAsWrapperMode()` when detected
  - Preserve all existing paths for backwards compatibility (Spec 029)

- [ ] **Generate catch-all routing** - NOT IMPLEMENTED (Spec 008)

  - Wrapper mode creates a single Lambda for all routes
  - Configure routing to send all paths to this Lambda
  - User's Go router handles path dispatch internally

- [ ] **Create single Lambda output** - NOT IMPLEMENTED (Spec 009)
  - Unlike handler mode (one Lambda per file), wrapper = one Lambda total
  - All routes handled by the single Go binary

#### 2.3 Validation and Error Handling

- [ ] **Validate wrapper import presence** - NOT IMPLEMENTED (Spec 021)

  - If `package main` but no `vercel.Start()` import detected
  - Show helpful error: "Did you mean to use wrapper mode? Import github.com/vercel/vercel-go"

- [ ] **Validate wrapper usage** - NOT IMPLEMENTED (Spec 022)
  - If import present but `vercel.Start()` not called
  - Runtime error is acceptable fallback (static analysis is limited)

#### 2.4 Dev Server Support

- [ ] **Implement wrapper mode in dev server** - NOT IMPLEMENTED (Spec 010)
  - Current state: `packages/go/dev-server.go` compiles entrypoint and starts server for handler mode only
  - Needed: Detect wrapper mode during `vercel dev`
  - Needed: Run the Go binary directly (it starts its own HTTP server via `Start()`)
  - Needed: Proxy requests to the Go server

---

### Phase 3: Test Fixtures and Framework Compatibility

**Depends on: Phase 2 completion**

#### 3.1 Create Wrapper Mode Test Fixtures

Create new fixtures in `packages/go/test/fixtures/`:

- [ ] **`wrapper-01-stdlib/`** - NOT EXISTS (Spec 011)

  - Basic `http.ServeMux` with `vercel.Start()`

  ```
  main.go - uses vercel.Start() with ServeMux
  go.mod  - requires github.com/vercel/vercel-go
  ```

- [ ] **`wrapper-02-gin/`** - NOT EXISTS (Spec 012)

  - Gin framework integration

  ```
  main.go - uses vercel.Start() with gin.Default()
  go.mod  - requires gin-gonic/gin and vercel-go
  ```

- [ ] **`wrapper-03-chi/`** - NOT EXISTS (Spec 013)

  - Chi router integration

  ```
  main.go - uses vercel.Start() with chi.NewRouter()
  go.mod  - requires go-chi/chi and vercel-go
  ```

- [ ] **`wrapper-04-gorilla/`** - NOT EXISTS (Spec 014)

  - gorilla/mux integration

  ```
  main.go - uses vercel.Start() with mux.NewRouter()
  go.mod  - requires gorilla/mux and vercel-go
  ```

- [ ] **`wrapper-05-binary-request/`** - NOT EXISTS (Spec 017)

  - Binary body handling test

- [ ] **`wrapper-06-binary-response/`** - NOT EXISTS (Spec 020)

  - Binary response handling test

- [ ] **`wrapper-07-headers/`** - NOT EXISTS (Specs 015, 018)

  - Header preservation test

- [ ] **`wrapper-08-query-params/`** - NOT EXISTS (Spec 027)

  - Query parameter handling test

- [ ] **`wrapper-09-path-params/`** - NOT EXISTS (Spec 026)
  - Path parameter handling test

#### 3.2 Backwards Compatibility Testing

- [ ] **Verify all existing fixtures pass** - NOT VERIFIED (Spec 029)
  - Fixtures 01-26 in `packages/go/test/fixtures/`
  - All existing `package handler` projects must continue working
  - Handler mode remains default when no wrapper signals detected

#### 3.3 Go Ecosystem Support

- [ ] **Verify `includeFiles` config works with wrapper mode** - NOT VERIFIED (Spec 023)

  - Existing `includeFiles` configuration should work
  - Common use: static assets, templates, config files

- [ ] **Verify go.mod dependencies work with wrapper mode** - NOT VERIFIED (Spec 024)

  - Builder already handles `go.mod` in handler mode
  - Same logic should work for wrapper mode

- [ ] **Verify go.work workspaces work with wrapper mode** - NOT VERIFIED (Spec 025)
  - Existing `go.work` support should extend to wrapper mode
  - Test with `wrapper-10-go-work/` fixture if needed

---

### Phase 4: Performance and Security

**Depends on: Phase 3 completion**

#### 4.1 Performance Targets

- [ ] **Cold start < 1 second** - NOT TESTED (Spec 031)

  - Measure Lambda cold start time
  - Optimize binary size: `-ldflags="-s -w"` (already in builder)
  - Ensure `CGO_ENABLED=0` for static binary

- [ ] **Warm response < 100ms** - NOT TESTED (Spec 032)
  - Measure request handling latency
  - Profile conversion overhead
  - Minimize allocations in hot path

#### 4.2 Security

- [ ] **Sanitize error messages** - NOT IMPLEMENTED (Spec 033)
  - Catch panics and return generic 500 errors
  - Do not expose Lambda ARN, request ID, or AWS account details
  - Log details server-side but return sanitized client response

---

### Phase 5: Documentation

**Depends on: Phase 4 completion (working implementation)**

#### 5.1 Package Documentation

- [ ] **Create README.md for `go/` module** - NOT EXISTS (Spec 034)
  - Quick start example
  - API reference for `vercel.Start()`
  - Environment variable documentation
  - Link to Vercel Go documentation

#### 5.2 Migration and Examples

- [ ] **Write migration guide** - NOT EXISTS (Spec 035)

  - Before/after code examples
  - Handler mode vs wrapper mode comparison
  - When to use each mode
  - Step-by-step migration instructions

- [ ] **Create framework examples** - NOT EXISTS (Spec 036)
  - Stdlib example with ServeMux
  - Gin example with middleware
  - Chi example with URL parameters
  - gorilla/mux example with path variables

---

## File Changes Summary

### New Files to Create

| File                                  | Purpose                                  | Status          |
| ------------------------------------- | ---------------------------------------- | --------------- |
| `go/vercel.go`                        | Main entry point with `Start()` function | NOT IMPLEMENTED |
| `go/lambda.go`                        | Lambda event handling and conversion     | NOT IMPLEMENTED |
| `go/lambda_test.go`                   | Unit tests for conversion logic          | NOT IMPLEMENTED |
| `go/README.md`                        | Package documentation                    | NOT IMPLEMENTED |
| `packages/go/test/fixtures/wrapper-*` | Test fixtures for wrapper mode           | NOT IMPLEMENTED |

### Files to Modify

| File                        | Changes                                       | Status       |
| --------------------------- | --------------------------------------------- | ------------ |
| `go/go.mod`                 | Add `github.com/aws/aws-lambda-go` dependency | NOT MODIFIED |
| `packages/go/src/index.ts`  | Add wrapper mode detection and build path     | NOT MODIFIED |
| `packages/go/analyze.go`    | Add import scanning for wrapper detection     | NOT MODIFIED |
| `packages/go/dev-server.go` | Add wrapper mode support                      | NOT MODIFIED |

### Files to Verify (No Changes Expected)

| File                              | Verification                                   | Status       |
| --------------------------------- | ---------------------------------------------- | ------------ |
| `packages/go/test/fixtures/01-26` | All existing handler mode tests must pass      | NOT VERIFIED |
| `packages/go/main.go`             | Existing template for handler mode (unchanged) | VERIFIED     |

---

## Reference: Existing go-bridge Pattern

The existing `github.com/vercel/go-bridge` (used in `packages/go/main.go`) shows the pattern:

```go
// main.go template uses:
import vc "github.com/vercel/go-bridge/go/bridge"
// ...
vc.Start(http.HandlerFunc(__VC_HANDLER_FUNC_NAME))
```

The wrapper mode will provide similar functionality but:

1. Be part of the `github.com/vercel/vercel-go` module
2. Accept any `http.Handler` (not just `http.HandlerFunc`)
3. Allow users to write their own `package main`

---

## Spec Status Tracking

**Phase 1 complete:** Core runtime specs implemented at runtime level. Builder integration (Phase 2) required for end-to-end spec validation.

### Core Runtime (Specs 001-004) - **RUNTIME COMPLETE**

- [x] 001: Lambda environment detection - IMPLEMENTED (`isLambdaEnvironment()`)
- [x] 002: Lambda event to http.Request conversion - IMPLEMENTED (`convertEventToRequest()`)
- [x] 003: http.Response to Lambda response conversion - IMPLEMENTED (`convertResponseToEvent()`)
- [x] 004: Local HTTP server mode - IMPLEMENTED (`startLocalServer()`)

### Builder Support (Specs 005-010)

- [ ] 005: Detect wrapper via import - NOT IMPLEMENTED
- [ ] 006: Detect wrapper via config - NOT IMPLEMENTED
- [ ] 007: Direct compilation in wrapper mode - NOT IMPLEMENTED
- [ ] 008: Catch-all routing generation - NOT IMPLEMENTED
- [ ] 009: Single Lambda output - NOT IMPLEMENTED
- [ ] 010: Dev server wrapper mode - NOT IMPLEMENTED

### Framework Compatibility (Specs 011-014)

- [ ] 011: stdlib ServeMux - NOT IMPLEMENTED
- [ ] 012: Gin - NOT IMPLEMENTED
- [ ] 013: Chi - NOT IMPLEMENTED
- [ ] 014: gorilla/mux - NOT IMPLEMENTED

### Request/Response Handling (Specs 015-020) - **RUNTIME COMPLETE**

- [x] 015: Request header preservation - IMPLEMENTED (`setRequestHeaders()`)
- [x] 016: Request body preservation - IMPLEMENTED (`getRequestBody()`)
- [x] 017: Binary request bodies - IMPLEMENTED (base64 decoding)
- [x] 018: Response headers - IMPLEMENTED (`convertResponseToEvent()`)
- [x] 019: Status codes - IMPLEMENTED (status code passthrough)
- [x] 020: Binary response bodies - IMPLEMENTED (`isBinaryContentType()`, base64 encoding)

### Validation (Specs 021-022)

- [ ] 021: Missing wrapper import error - NOT IMPLEMENTED
- [ ] 022: Wrapper usage validation - NOT IMPLEMENTED

### Go Ecosystem (Specs 023-025)

- [ ] 023: includeFiles config - NOT VERIFIED
- [ ] 024: go.mod dependencies - NOT VERIFIED
- [ ] 025: go.work workspaces - NOT VERIFIED

### Parameter Handling (Specs 026-028) - **RUNTIME COMPLETE**

- [x] 026: Path parameters - IMPLEMENTED (path preserved for routers)
- [x] 027: Query parameters - IMPLEMENTED (`buildURL()`)
- [x] 028: RemoteAddr from X-Forwarded-For - IMPLEMENTED (`getXForwardedFor()`)

### Backwards Compatibility (Specs 029-030)

- [ ] 029: Legacy handler mode works - NOT VERIFIED
- [ ] 030: Mode detection (wrapper vs legacy) - NOT IMPLEMENTED

### Performance (Specs 031-032)

- [ ] 031: Cold start < 1 second - NOT TESTED
- [ ] 032: Warm response < 100ms - NOT TESTED

### Security (Spec 033)

- [ ] 033: No internal details exposed - NOT IMPLEMENTED

### Documentation (Specs 034-036)

- [ ] 034: README documentation - NOT IMPLEMENTED
- [ ] 035: Migration guide - NOT IMPLEMENTED
- [ ] 036: Framework examples - NOT IMPLEMENTED

---

## Critical Blockers

### ~~Current Blocker: No Go Runtime Code~~ - **RESOLVED**

~~The `go/` module is empty except for `go.mod`.~~ **Phase 1 complete.** The core wrapper runtime is now implemented:

- `go/vercel.go`: `Start()` function with environment detection
- `go/lambda.go`: Full Lambda event handling and conversion
- `go/lambda_test.go`: 10 test functions, all passing

### Current Blocker: Builder Error for `package main`

`packages/go/src/index.ts` (lines 188-190) currently throws an error when detecting `package main` with `go.mod`:

```
"Please change `package main` to `package handler`"
```

**Impact:**

- Users cannot use wrapper mode even if they import `github.com/vercel/vercel-go`
- The error is thrown before any wrapper detection can occur

**Resolution:** Update mode detection logic in Phase 2 to check for wrapper mode before throwing this error.

---

## Implementation Notes

### Use Go stdlib Where Possible

The wrapper runtime should minimize external dependencies:

- **Use stdlib**: `net/http`, `net/http/httptest`, `encoding/base64`, `encoding/json`, `os`, `strings`
- **Required external**: `github.com/aws/aws-lambda-go` (for Lambda integration)
- **NOT needed**: The existing `go-bridge` - we're replacing its functionality

### Key Code Patterns

**Request conversion using stdlib:**

```go
// Use httptest.NewRequest for construction
req := httptest.NewRequest(event.HTTPMethod, url, body)
for key, values := range event.MultiValueHeaders {
    for _, value := range values {
        req.Header.Add(key, value)
    }
}
```

**Response capture using stdlib:**

```go
// Use httptest.NewRecorder for capture
rec := httptest.NewRecorder()
handler.ServeHTTP(rec, req)
// Extract: rec.Code, rec.Header(), rec.Body.Bytes()
```

**Binary detection heuristics:**

```go
func isBinaryContentType(contentType string) bool {
    return strings.HasPrefix(contentType, "image/") ||
           strings.HasPrefix(contentType, "audio/") ||
           strings.HasPrefix(contentType, "video/") ||
           contentType == "application/octet-stream" ||
           // ... other binary types
}
```

---

## Success Criteria

1. All 36 specs passing
2. All existing test fixtures (01-26) continue to pass
3. Framework examples work (stdlib, Gin, Chi, gorilla/mux)
4. Performance targets met (cold start < 1s, warm < 100ms)
5. Documentation complete and accurate

---

## Recommended Implementation Order

1. **Week 1:** Phase 1 - Core Wrapper Runtime

   - Implement `go/vercel.go` with `Start()` function
   - Implement `go/lambda.go` with event conversion
   - Add unit tests in `go/lambda_test.go`
   - Verify Specs 001-004 pass

2. **Week 2:** Phase 2 - Builder Support

   - Update `analyze.go` with import scanning
   - Update `index.ts` with wrapper mode detection and build path
   - Update dev server if needed
   - Verify Specs 005-010 pass

3. **Week 3:** Phase 3 - Test Fixtures and Compatibility

   - Create wrapper test fixtures
   - Verify framework compatibility
   - Verify backwards compatibility
   - Verify Specs 011-029 pass

4. **Week 4:** Phase 4-5 - Performance, Security, Documentation
   - Performance testing and optimization
   - Security hardening
   - Documentation
   - Verify all remaining specs pass
