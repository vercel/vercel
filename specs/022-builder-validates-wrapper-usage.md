# Builder validates wrapper import is used correctly

## Category

functional

## Description

Builder validates wrapper import is used correctly

## Steps

1. Provide package main with wrapper import but no vercel.Start() call
2. Builder detects import but no usage
3. Builder shows warning or error about missing vercel.Start()

## Status

- [ ] Passes
