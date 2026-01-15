## Build & Run

Succinct rules for how to BUILD the project:

## Validation

Run these after implementing to get immediate feedback:

- Tests: `go test ./...`
- Vet: `go vet ./...`
- Lint: `golangci-lint run ./...`
- Builder Tests (TS): `cd packages/go && npm test`

## Operational Notes:

Succinct learnings about how to RUN the project:

### References

- Current go-bridge: https://github.com/vercel/go-bridge
- AWS Lambda Go SDK: https://github.com/aws/aws-lambda-go
- Lambda custom runtime: https://docs.aws.amazon.com/lambda/latest/dg/runtimes-custom.html
