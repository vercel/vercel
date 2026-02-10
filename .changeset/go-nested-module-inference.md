---
'@vercel/go': patch
---

Fixed standalone Go server builds for nested modules (e.g. `services/go-api/go.mod`). The builder now searches for `go.mod` starting from the entrypoint's directory instead of only the project root, and sets the build working directory to the module root. This fixes `go.mod file not found` errors when using Go services in multi-service projects.
