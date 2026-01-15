# Wrapper mode handles path parameters

## Category

functional

## Description

Wrapper mode handles path parameters

## Steps

1. Register route with path parameter (e.g., /users/:id)
2. Make request to /users/123
3. Handler extracts path parameter via router's mechanism
4. Verify parameter value is correct

## Status

- [ ] Passes
