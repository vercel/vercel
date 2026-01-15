# Wrapper mode handles query parameters

## Category

functional

## Description

Wrapper mode handles query parameters

## Steps

1. Make request with query string (e.g., ?name=test&page=1)
2. Handler reads query params via r.URL.Query()
3. Verify all query parameters are accessible
4. Verify parameter values are correct

## Status

- [ ] Passes
