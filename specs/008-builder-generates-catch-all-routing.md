# Builder generates catch-all routing for wrapper mode

## Category

functional

## Description

Builder generates catch-all routing for wrapper mode

## Steps

1. Determine base path from entrypoint location (e.g., api/main.go -> /api)
2. Generate route: { src: '/api/(.\*)', dest: '/api' }
3. Generate route: { src: '/api', dest: '/api' }
4. Return routes array in build output

## Status

- [x] Passes
