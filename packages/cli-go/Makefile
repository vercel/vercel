# The version always matches packages/cli/package.json.
VERSION := $(shell node -p "require('../cli/package.json').version")
LDFLAGS := -X github.com/vercel/vercel/packages/cli-go/internal/build.Version=$(VERSION)

.PHONY: build test lint

build:
	go build -ldflags "$(LDFLAGS)" -o bin/vercel ./cmd/vercel

test:
	go test ./...

lint:
	gofmt -l . | (! grep .)
	go vet ./...
