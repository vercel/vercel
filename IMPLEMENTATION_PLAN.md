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

### Phase 2: Builder Wrapper Mode Support (`packages/go/`) - **COMPLETE**

**Status: Core detection, build path, and dev server support implemented.**

#### 2.1 Wrapper Mode Detection - **COMPLETE**

- [x] **Add import scanning to `analyze.go`** - IMPLEMENTED (Spec 005)
- [x] **Support `wrapper: true` in vercel.json config** - IMPLEMENTED (Spec 006)
- [x] **Update mode detection logic in `index.ts`** - IMPLEMENTED (Spec 030)

#### 2.2 Wrapper Mode Build Path (`packages/go/src/index.ts`) - **COMPLETE**

- [x] **Create `buildHandlerAsWrapperMode()` function** - IMPLEMENTED (Spec 007)
- [x] **Modify build routing logic** - IMPLEMENTED
- [x] **Generate catch-all routing** - IMPLEMENTED (Spec 008)
- [x] **Create single Lambda output** - IMPLEMENTED (Spec 009)

#### 2.3 Validation and Error Handling

- [x] **Validate wrapper import presence** - IMPLEMENTED (Spec 021)
- [ ] **Validate wrapper usage** - NOT IMPLEMENTED (Spec 022)

#### 2.4 Dev Server Support

- [x] **Implement wrapper mode in dev server** - IMPLEMENTED (Spec 010)
  - Updated `go/vercel.go` to support `VERCEL_DEV_PORT_FILE` protocol
  - Updated `packages/go/src/index.ts` to build and run wrapper mode projects directly

---

### Phase 3: Test Fixtures and Framework Compatibility

**Depends on: Phase 2 completion**

#### 3.1 Create Wrapper Mode Test Fixtures

Create new fixtures in `packages/go/test/fixtures/`:

- [ ] **`wrapper-01-stdlib/`** - NOT EXISTS (Spec 011)
- [ ] **`wrapper-02-gin/`** - NOT EXISTS (Spec 012)
- [ ] **`wrapper-03-chi/`** - NOT EXISTS (Spec 013)
- [ ] **`wrapper-04-gorilla/`** - NOT EXISTS (Spec 014)
- [ ] **`wrapper-05-binary-request/`** - NOT EXISTS (Spec 017)
- [ ] **`wrapper-06-binary-response/`** - NOT EXISTS (Spec 020)
- [ ] **`wrapper-07-headers/`** - NOT EXISTS (Specs 015, 018)
- [ ] **`wrapper-08-query-params/`** - NOT EXISTS (Spec 027)
- [ ] **`wrapper-09-path-params/`** - NOT EXISTS (Spec 026)

#### 3.2 Backwards Compatibility Testing

- [ ] **Verify all existing fixtures pass** - NOT VERIFIED (Spec 029)

#### 3.3 Go Ecosystem Support

- [ ] **Verify `includeFiles` config works with wrapper mode** - NOT VERIFIED (Spec 023)
- [ ] **Verify go.mod dependencies work with wrapper mode** - NOT VERIFIED (Spec 024)
- [ ] **Verify go.work workspaces work with wrapper mode** - NOT VERIFIED (Spec 025)

---

### Phase 4: Performance and Security

**Depends on: Phase 3 completion**

#### 4.1 Performance Targets

- [ ] **Cold start < 1 second** - NOT TESTED (Spec 031)
- [ ] **Warm response < 100ms** - NOT TESTED (Spec 032)

#### 4.2 Security

- [ ] **Sanitize error messages** - NOT IMPLEMENTED (Spec 033)

---

### Phase 5: Documentation

**Depends on: Phase 4 completion (working implementation)**

#### 5.1 Package Documentation

- [ ] **Create README.md for `go/` module** - NOT EXISTS (Spec 034)

#### 5.2 Migration and Examples

- [ ] **Write migration guide** - NOT EXISTS (Spec 035)
- [ ] **Create framework examples** - NOT EXISTS (Spec 036)

---

## File Changes Summary

### New Files to Create

| File                                  | Purpose                        | Status          |
| ------------------------------------- | ------------------------------ | --------------- |
| `go/README.md`                        | Package documentation          | NOT IMPLEMENTED |
| `packages/go/test/fixtures/wrapper-*` | Test fixtures for wrapper mode | NOT IMPLEMENTED |

### Files to Modify

| File                       | Changes                             | Status   |
| -------------------------- | ----------------------------------- | -------- |
| `go/vercel.go`             | Add dev server support              | MODIFIED |
| `packages/go/src/index.ts` | Add wrapper mode dev server support | MODIFIED |

---

## Spec Status Tracking

### Core Runtime (Specs 001-004) - **RUNTIME COMPLETE**

- [x] 001: Lambda environment detection - IMPLEMENTED
- [x] 002: Lambda event to http.Request conversion - IMPLEMENTED
- [x] 003: http.Response to Lambda response conversion - IMPLEMENTED
- [x] 004: Local HTTP server mode - IMPLEMENTED

### Builder Support (Specs 005-010) - **COMPLETE**

- [x] 005: Detect wrapper via import - IMPLEMENTED
- [x] 006: Detect wrapper via config - IMPLEMENTED
- [x] 007: Direct compilation in wrapper mode - IMPLEMENTED
- [x] 008: Catch-all routing generation - IMPLEMENTED
- [x] 009: Single Lambda output - IMPLEMENTED
- [x] 010: Dev server wrapper mode - IMPLEMENTED

### Framework Compatibility (Specs 011-014)

- [ ] 011: stdlib ServeMux - NOT IMPLEMENTED
- [ ] 012: Gin - NOT IMPLEMENTED
- [ ] 013: Chi - NOT IMPLEMENTED
- [ ] 014: gorilla/mux - NOT IMPLEMENTED

### Request/Response Handling (Specs 015-020) - **RUNTIME COMPLETE**

- [x] 015: Request header preservation - IMPLEMENTED
- [x] 016: Request body preservation - IMPLEMENTED
- [x] 017: Binary request bodies - IMPLEMENTED
- [x] 018: Response headers - IMPLEMENTED
- [x] 019: Status codes - IMPLEMENTED
- [x] 020: Binary response bodies - IMPLEMENTED

### Validation (Specs 021-022)

- [ ] 021: Missing wrapper import error - NOT IMPLEMENTED
- [ ] 022: Wrapper usage validation - NOT IMPLEMENTED

### Go Ecosystem (Specs 023-025)

- [ ] 023: includeFiles config - NOT VERIFIED
- [ ] 024: go.mod dependencies - NOT VERIFIED
- [ ] 025: go.work workspaces - NOT VERIFIED

### Parameter Handling (Specs 026-028) - **RUNTIME COMPLETE**

- [x] 026: Path parameters - IMPLEMENTED
- [x] 027: Query parameters - IMPLEMENTED
- [x] 028: RemoteAddr from X-Forwarded-For - IMPLEMENTED

### Backwards Compatibility (Specs 029-030) - **PARTIAL**

- [ ] 029: Legacy handler mode works - NOT VERIFIED
- [x] 030: Mode detection (wrapper vs legacy) - IMPLEMENTED

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

### Remaining Work

The following items are pending for full wrapper mode support:

- **Specs 011-014:** Framework compatibility testing (requires test fixtures)
- **Specs 031-033:** Performance and security testing

---

## Success Criteria

1. All 36 specs passing
2. All existing test fixtures (01-26) continue to pass
3. Framework examples work (stdlib, Gin, Chi, gorilla/mux)
4. Performance targets met (cold start < 1s, warm < 100ms)
5. Documentation complete and accurate

---
