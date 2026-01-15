# Go wrapper package detects Lambda environment

## Category

functional

## Description

Go wrapper package detects Lambda environment

## Steps

1. Import github.com/vercel/vercel-go in a Go application
2. Call vercel.Start(handler) with an http.Handler
3. When AWS_LAMBDA_FUNCTION_NAME env var is set, Lambda runtime starts
4. When env var is not set, local HTTP server starts on PORT (default 3000)

## Status

- [ ] Passes
