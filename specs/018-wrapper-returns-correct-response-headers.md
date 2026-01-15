# Wrapper mode returns correct response headers

## Category

functional

## Description

Wrapper mode returns correct response headers

## Steps

1. Handler sets custom response headers via w.Header().Set()
2. Deploy and make request
3. Verify response includes all custom headers
4. Verify Content-Type is preserved

## Status

- [ ] Passes
