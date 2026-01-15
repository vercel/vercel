# Wrapper mode works with gorilla/mux

## Category

functional

## Description

Wrapper mode works with gorilla/mux

## Steps

1. Create application using mux.NewRouter()
2. Register routes with r.HandleFunc()
3. Pass mux.Router to vercel.Start() (implements http.Handler)
4. Deploy and verify all routes work

## Status

- [ ] Passes
