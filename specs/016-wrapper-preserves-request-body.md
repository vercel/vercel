# Wrapper mode preserves request body

## Category

functional

## Description

Wrapper mode preserves request body

## Steps

1. Send POST/PUT request with JSON body
2. Handler reads body via io.ReadAll(r.Body)
3. Verify body content matches sent data
4. Verify Content-Length is set correctly

## Status

- [ ] Passes
