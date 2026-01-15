# Wrapper mode does not expose internal Lambda details

## Category

security

## Description

Wrapper mode does not expose internal Lambda details

## Steps

1. Deploy wrapper mode application
2. Make various requests including malformed ones
3. Verify no internal Lambda/AWS details leak in responses
4. Verify error responses don't expose sensitive info

## Status

- [ ] Passes
