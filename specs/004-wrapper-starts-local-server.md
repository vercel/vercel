# Go wrapper starts local HTTP server for development

## Category

functional

## Description

Go wrapper starts local HTTP server for development

## Steps

1. Call vercel.Start(handler) without Lambda env vars set
2. Read PORT from environment (default to 3000)
3. Start http.Server on specified port
4. Serve requests using provided handler

## Status

- [ ] Passes
