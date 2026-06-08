---
'@vercel/build-utils': patch
'@vercel/fs-detectors': patch
'@vercel/container': patch
'@vercel/node': patch
'vercel': patch
---

Add an experimental container service runtime that passes prebuilt OCI image references through as build output.

Skip CI-only fixture type copying for `@vercel/node` builds when test fixtures are not present in deployment inputs.
