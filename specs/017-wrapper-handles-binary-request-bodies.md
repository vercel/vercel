# Wrapper mode handles binary request bodies

## Category

functional

## Description

Wrapper mode handles binary request bodies

## Steps

1. Send request with binary body (e.g., file upload)
2. Body is base64 encoded in Lambda event
3. Wrapper decodes body before creating http.Request
4. Handler receives correct binary data

## Status

- [ ] Passes
