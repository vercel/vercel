# Wrapper mode handles binary response bodies

## Category

functional

## Description

Wrapper mode handles binary response bodies

## Steps

1. Handler writes binary data (e.g., image) to response
2. Wrapper encodes body as base64 in Lambda response
3. Client receives correct binary data
4. Content-Type header is preserved

## Status

- [ ] Passes
