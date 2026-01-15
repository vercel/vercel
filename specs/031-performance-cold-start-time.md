# Wrapper mode has acceptable cold start time

## Category

performance

## Description

Wrapper mode has acceptable cold start time

## Steps

1. Deploy wrapper mode application
2. Trigger cold start by waiting for Lambda to scale down
3. Measure time from request to response
4. Verify cold start is within acceptable range (< 1s for simple app)

## Status

- [ ] Passes
