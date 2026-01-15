# Wrapper mode works with Gin framework

## Category

functional

## Description

Wrapper mode works with Gin framework

## Steps

1. Create application using gin.Default()
2. Register routes with r.GET(), r.POST(), etc.
3. Pass gin.Engine to vercel.Start() (implements http.Handler)
4. Deploy and verify all routes work

## Status

- [ ] Passes
