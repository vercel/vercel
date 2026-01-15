# Wrapper mode sets RemoteAddr from X-Forwarded-For

## Category

functional

## Description

Wrapper mode sets RemoteAddr from X-Forwarded-For

## Steps

1. Make request through Vercel's proxy
2. X-Forwarded-For header is set by proxy
3. Wrapper sets r.RemoteAddr from this header
4. Handler can access client IP via r.RemoteAddr

## Status

- [ ] Passes
