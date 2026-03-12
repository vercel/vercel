# Vercel Python Runtime

This package provides the bridge needed to run Python apps on Vercel Compute.
Specifically, it provides an ASGI/WSGI server implementation, facilitates
observability, logging, and other integration.

## Vendored Dependencies

Runtime dependencies (uvicorn, werkzeug) are vendored into
`src/vercel_runtime/_vendor/` to avoid version conflicts with user projects.
To re-sync after editing `src/vercel_runtime/_vendor/vendor.txt`:

```sh
./vendor.sh
```
