# Wrapper mode preserves request headers

## Category

functional

## Description

Wrapper mode preserves request headers

## Steps

1. Send request with custom headers to deployed app
2. Handler reads headers via r.Header.Get()
3. Verify all headers are accessible
4. Verify Host header is set correctly

## Status

- [ ] Passes
