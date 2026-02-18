# @vercel/router-sdk

## 0.0.31

### Patch Changes

- Add support for `functions[*].functionFailoverRegions` in `vercel.json` and build output config generation. ([#14969](https://github.com/vercel/vercel/pull/14969))

  This enables per-function failover region configuration instead of only top-level defaults for all functions.

## 0.0.30

### Patch Changes

- Add new expirementalTrigger format for queues v2beta ([#14970](https://github.com/vercel/vercel/pull/14970))

## 0.0.29

### Patch Changes

- Add support for `regions` in `vercel.json` function-level configuration. ([#14963](https://github.com/vercel/vercel/pull/14963))

  Matching function `regions` are now parsed from `functions` config, written into lambda output config, and documented in config types so they override top-level deployment regions for that function.

## 0.0.28

### Patch Changes

- Add maxConcurrency to experimentalTriggers ([#14725](https://github.com/vercel/vercel/pull/14725))

## 0.0.27

### Patch Changes

- Remove references to nonexistent `redirects` property ([#14708](https://github.com/vercel/vercel/pull/14708))

## 0.0.26

### Patch Changes

- Add `experimentalServices` to `vercel.json` ([#14612](https://github.com/vercel/vercel/pull/14612))

## 0.0.25

### Patch Changes

- update to support respectOriginCacheControl ([#14507](https://github.com/vercel/vercel/pull/14507))

## 0.0.24

### Patch Changes

- update to public ([#14480](https://github.com/vercel/vercel/pull/14480))

## 0.0.23

### Patch Changes

- support env in routes, rewrites, and redirects

## 0.0.22

### Patch Changes

- update env callback

## 0.0.21

### Patch Changes

- update to routes, via a singleton

## 0.0.20

### Patch Changes

- full parity in types

## 0.0.19

### Patch Changes

- test overhaul

## 0.0.18

### Patch Changes

- update rewrites deprecation

## 0.0.17

### Patch Changes

- fix versioning

## 0.0.16

### Patch Changes

- versioning

## 0.0.15

### Patch Changes

- add json schema support

## 0.0.14

### Patch Changes

- vercel config type

## 0.0.13

### Patch Changes

- add more rewrite properties

## 0.0.12

### Patch Changes

- auto convert support

## 0.0.11

### Patch Changes

- add transform operations

## 0.0.10

### Patch Changes

- add callbacks and property assignment

## 0.0.9

### Patch Changes

- change name

## 0.0.8

### Patch Changes

- add env field

## 0.0.7

### Patch Changes

- preserve content

## 0.0.6

### Patch Changes

- update log

## 0.0.5

### Patch Changes

- make other fields optional

## 0.0.5

### Patch Changes

- update to router-sdk

## 0.0.4

### Patch Changes

- update bin

## 0.0.3

### Patch Changes

- change bin

## 0.0.2

### Patch Changes

- 0fab47c: Publish the initial @vercel/router-sdk package.
