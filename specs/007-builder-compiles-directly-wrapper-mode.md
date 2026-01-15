# Builder compiles user code directly in wrapper mode

## Category

functional

## Description

Builder compiles user code directly in wrapper mode

## Steps

1. Detect wrapper mode for package main entrypoint
2. Do NOT generate main.go template
3. Compile user's main.go directly with go build
4. Output binary as bootstrap for Lambda runtime

## Status

- [ ] Passes
