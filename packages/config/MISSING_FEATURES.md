# Missing Features

### ✅ Completed

- [x] redirects
- [x] rewrites
- [x] headers
- [x] crons
- [x] env shared secrets

### 🔴 High Priority

### Routes Enhancement

- [x] Add `methods` to route() - Array of HTTP method types
- [x] Add `status` to route() - Custom status codes
- [x] Enhance `has` support - Full conditional matching with all operators (eq, neq, inc, ninc, pre, suf, gt, gte, lt, lte)

### Transform Operations

- [x] Support `append` operation - Append values to headers/query params
- [x] Support `delete` operation - Delete headers/query params
- [x] All three operations (set, append, delete) work in callback syntax
- [ ] conditional selectors for transforms

### 🟡 Medium Priority

### Git Configuration (export const)

- [x] `git.deploymentEnabled` - Control which branches trigger deployments (boolean | object with branch patterns)
- [x] `github.autoAlias` - Control preview deployments upon merge (boolean)
- [x] `github.autoJobCancelation` - Control if builds are cancelled for newer commits (boolean)

### Simple Properties (export const)

- [x] Support everything else as a exported constant (framework, outputDirectory, buildCommand, devCommand, ignoreCommand, bunVersion, fluid, functions, images, passiveRegions, etc.)

### ⚫ Low Priority (Deprecated)

- [ ] name
- [ ] version
- [ ] alias
- [ ] scope
- [ ] env
- [ ] build.env
- [ ] builds
- [ ] github.silent (deprecated in favor of dashboard settings)
- [ ] github.enabled (deprecated in favor of git.deploymentEnabled)
