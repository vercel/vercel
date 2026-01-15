# Builder detects wrapper mode via config flag

## Category

functional

## Description

Builder detects wrapper mode via config flag

## Steps

1. Set wrapper: true in vercel.json functions config
2. Provide entrypoint with package main
3. Builder reads config and enables wrapper mode
4. Builder proceeds with wrapper mode build

## Status

- [ ] Passes
