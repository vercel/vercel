# Dev server works with wrapper mode

## Category

functional

## Description

Dev server works with wrapper mode

## Steps

1. Run vercel dev with wrapper mode entrypoint
2. Builder compiles user's main.go
3. Spawn compiled binary with PORT env var set
4. Return port to Vercel dev for proxying
5. Requests are proxied to running Go application

## Status

- [ ] Passes
