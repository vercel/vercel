---
'@vercel/go': patch
'@vercel/fs-detectors': patch
---

Fix service route-prefix stripping for standalone Go services in services mode.

This updates Go's executable bootstrap to strip generated service route prefixes in production and adds a Go dev wrapper (`vc_init_dev.go`) so standalone Go dev also strips generated service route prefixes before forwarding requests to the user app.

Update the `09-services-frontend-backend-go-zc` e2e fixture backend from Ruby/Sinatra to Go so it exercises Go services detection and routing in zero-config services mode.
