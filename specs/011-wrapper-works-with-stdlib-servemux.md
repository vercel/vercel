# Wrapper mode works with standard library http.ServeMux

## Category

functional

## Description

Wrapper mode works with standard library http.ServeMux

## Steps

1. Create application using http.NewServeMux()
2. Register handlers with mux.HandleFunc()
3. Pass mux to vercel.Start()
4. Deploy and verify all routes work

## Status

- [ ] Passes
