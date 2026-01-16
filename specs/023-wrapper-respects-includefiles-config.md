# Wrapper mode respects includeFiles config

## Category

functional

## Description

Wrapper mode respects includeFiles config

## Steps

1. Set includeFiles pattern in vercel.json
2. Build wrapper mode application
3. Verify matched files are included in Lambda bundle
4. Handler can access included files at runtime

## Status

- [x] Passes
