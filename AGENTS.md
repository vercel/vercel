## Build & Run

Succinct rules for how to BUILD the project:

- To build fixtures manually: `go build` inside the fixture directory (requires `go mod tidy` first).

## Validation

Run these after implementing to get immediate feedback:

- Tests: `go test ./...`
- Vet: `go vet ./...`
- Lint: `golangci-lint run ./...`
- Builder Tests (TS): `cd packages/go && npm test` (Note: deployment tests require `VERCEL_TOKEN`)

## Operational Notes:

Succinct learnings about how to RUN the project:

- Integration tests in `packages/go` fail without `VERCEL_TOKEN`. Use unit tests and manual verification (compilation) for local changes.
- `go` module logic is verified by `go/lambda_test.go`.
- Builder logic is verified by `packages/go/test/index.test.ts` (unit) and partially by `packages/go/test/fixtures.test.js`.
- `go mod tidy` ignores `go.work`, so `packages/go` builder skips it when `go.work` is detected to support local unpublished modules.

### References

- Current go-bridge: https://github.com/vercel/go-bridge
- AWS Lambda Go SDK: https://github.com/aws/aws-lambda-go
- Lambda custom runtime: https://docs.aws.amazon.com/lambda/latest/dg/runtimes-custom.html
