# Legacy handler mode still works

## Category

functional

## Description

Legacy handler mode still works

## Steps

1. Provide entrypoint with package handler (non-main)
2. Export Handler function with http.HandlerFunc signature
3. Builder detects handler mode
4. Builder generates main.go and builds as before

## Status

- [ ] Passes
