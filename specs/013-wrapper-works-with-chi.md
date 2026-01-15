# Wrapper mode works with Chi router

## Category

functional

## Description

Wrapper mode works with Chi router

## Steps

1. Create application using chi.NewRouter()
2. Register routes with r.Get(), r.Post(), etc.
3. Pass chi.Router to vercel.Start() (implements http.Handler)
4. Deploy and verify all routes work

## Status

- [ ] Passes
