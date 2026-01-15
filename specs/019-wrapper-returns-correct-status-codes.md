# Wrapper mode returns correct status codes

## Category

functional

## Description

Wrapper mode returns correct status codes

## Steps

1. Handler calls w.WriteHeader(statusCode)
2. Test with 200, 201, 400, 404, 500 status codes
3. Verify Lambda response has correct statusCode
4. Verify client receives correct HTTP status

## Status

- [ ] Passes
