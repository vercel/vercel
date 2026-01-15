# Builder shows helpful error for missing wrapper import

## Category

functional

## Description

Builder shows helpful error for missing wrapper import

## Steps

1. Provide package main entrypoint without wrapper import
2. Do not set wrapper: true in config
3. Builder detects package main without wrapper
4. Builder shows error with instructions to add import and vercel.Start()

## Status

- [ ] Passes
