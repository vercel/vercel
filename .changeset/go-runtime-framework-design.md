---
'@vercel/go': minor
'@vercel/frameworks': minor
---

Add experimental Go runtime framework preset.

This adds support for deploying standalone Go HTTP servers (using `package main` with `func main()`) in addition to the existing serverless function pattern. The preset supports:

- `main.go` at project root (simple projects)
- `cmd/api/main.go` (API servers)
- `cmd/server/main.go` (HTTP servers)

The Go application must listen on the port specified by the `PORT` environment variable.
