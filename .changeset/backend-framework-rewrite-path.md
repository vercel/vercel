---
'@vercel/build-utils': minor
'@vercel/backends': minor
'@vercel/express': minor
'@vercel/hono': minor
'@vercel/h3': minor
'@vercel/koa': minor
'@vercel/nestjs': minor
'@vercel/fastify': minor
'@vercel/elysia': minor
'vercel': patch
---

Expose the resolved rewrite destination as the request path observed by Node backend framework applications (express, hono, h3, koa, nestjs, fastify, elysia) and the unified backends builder, and warn affected backend projects about the behavior change.
