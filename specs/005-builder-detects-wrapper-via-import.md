# Builder detects wrapper mode via import

## Category

functional

## Description

Builder detects wrapper mode via import

## Steps

1. Provide entrypoint with package main
2. Include import "github.com/vercel/vercel-go" in the file
3. Builder scans file and detects wrapper import
4. Builder proceeds with wrapper mode build

## Status

- [ ] Passes
