# @vercel/hono

## 0.1.2

### Patch Changes

- Updated dependencies [[`5eac17d9c045d3c9582d8a69fc1a6ec30fdaa0b0`](https://github.com/vercel/vercel/commit/5eac17d9c045d3c9582d8a69fc1a6ec30fdaa0b0)]:
  - @vercel/node@5.3.24

## 0.1.1

### Patch Changes

- Updated dependencies [[`aaddc91799f5b26a626dd1a7c0e070f334d09be5`](https://github.com/vercel/vercel/commit/aaddc91799f5b26a626dd1a7c0e070f334d09be5)]:
  - @vercel/node@5.3.23

## 0.1.0

### Minor Changes

- Add h3 zero config support ([#13942](https://github.com/vercel/vercel/pull/13942))

## 0.0.25

### Patch Changes

- Fix issue where hono build output metadata sent "name" instead of "slug" ([#13935](https://github.com/vercel/vercel/pull/13935))

## 0.0.24

### Patch Changes

- Add framework slug and version for Express and Hono builders to build output ([#13918](https://github.com/vercel/vercel/pull/13918))

- Improve error message when entrypoints do not have necessary import ([#13919](https://github.com/vercel/vercel/pull/13919))

## 0.0.23

### Patch Changes

- Updated dependencies [[`d39fd1e138b96509af6b8ebf9cc634f44d1ed38f`](https://github.com/vercel/vercel/commit/d39fd1e138b96509af6b8ebf9cc634f44d1ed38f)]:
  - @vercel/node@5.3.22

## 0.0.22

### Patch Changes

- Updated dependencies [[`db47f7031bacfe0d07e5a657788e1e74c134bf81`](https://github.com/vercel/vercel/commit/db47f7031bacfe0d07e5a657788e1e74c134bf81)]:
  - @vercel/node@5.3.21

## 0.0.21

### Patch Changes

- Support package.json#main field as the entrypoint ([#13846](https://github.com/vercel/vercel/pull/13846))

- Updated dependencies [[`c93f5e6c8563cef8e1f6b6caa6afbe2a43a8af61`](https://github.com/vercel/vercel/commit/c93f5e6c8563cef8e1f6b6caa6afbe2a43a8af61), [`c93f5e6c8563cef8e1f6b6caa6afbe2a43a8af61`](https://github.com/vercel/vercel/commit/c93f5e6c8563cef8e1f6b6caa6afbe2a43a8af61)]:
  - @vercel/node@5.3.20

## 0.0.20

### Patch Changes

- Always compile `.mts` to ESM ([#13693](https://github.com/vercel/vercel/pull/13693))

- Updated dependencies [[`fea94eea32f9df7c72d9ea95434d84c44f4ef082`](https://github.com/vercel/vercel/commit/fea94eea32f9df7c72d9ea95434d84c44f4ef082)]:
  - @vercel/node@5.3.19

## 0.0.19

### Patch Changes

- Updated dependencies []:
  - @vercel/node@5.3.18

## 0.0.18

### Patch Changes

- Add .cts support to express and hono builders ([#13828](https://github.com/vercel/vercel/pull/13828))

- - Expand framework detection to src/app and src/server files. ([#13828](https://github.com/vercel/vercel/pull/13828))
  - Improve handling when multiple entrypoints are detected.
- Updated dependencies [[`2f9a6e68f845ff06c60c7cdab15bb4f4321ac8ed`](https://github.com/vercel/vercel/commit/2f9a6e68f845ff06c60c7cdab15bb4f4321ac8ed), [`dc0dedda5d8c5657ae03d3a69b855e02abba5797`](https://github.com/vercel/vercel/commit/dc0dedda5d8c5657ae03d3a69b855e02abba5797), [`a6ac37a8f1f12bb94725fafbeb09e3a58fea6603`](https://github.com/vercel/vercel/commit/a6ac37a8f1f12bb94725fafbeb09e3a58fea6603)]:
  - @vercel/node@5.3.17

## 0.0.17

### Patch Changes

- Updated dependencies [[`6260486192ca407fc2d91f317ed81533548b8629`](https://github.com/vercel/vercel/commit/6260486192ca407fc2d91f317ed81533548b8629)]:
  - @vercel/static-config@3.1.2
  - @vercel/node@5.3.16

## 0.0.16

### Patch Changes

- Add support for specifying an output directory for Express and Hono apps ([#13805](https://github.com/vercel/vercel/pull/13805))

- Updated dependencies [[`9cc5e3a04f4158545e55a9c0c66c13ac51db1ce1`](https://github.com/vercel/vercel/commit/9cc5e3a04f4158545e55a9c0c66c13ac51db1ce1), [`0985931965d9ba8f2a0198f34a4a4838c341769a`](https://github.com/vercel/vercel/commit/0985931965d9ba8f2a0198f34a4a4838c341769a)]:
  - @vercel/node@5.3.15

## 0.0.15

### Patch Changes

- Add support for app.js as a server entrypoint ([#13798](https://github.com/vercel/vercel/pull/13798))

- Updated dependencies []:
  - @vercel/node@5.3.14

## 0.0.14

### Patch Changes

- Updated dependencies [[`bebaf76f5df3e640c96d913049588c7ab741719b`](https://github.com/vercel/vercel/commit/bebaf76f5df3e640c96d913049588c7ab741719b)]:
  - @vercel/node@5.3.13

## 0.0.13

### Patch Changes

- Mark package as public ([#13750](https://github.com/vercel/vercel/pull/13750))

## 0.0.12

### Patch Changes

- Include support for custom build scripts for backend builders ([#13739](https://github.com/vercel/vercel/pull/13739))

## 0.0.11

### Patch Changes

- Add support for custom build scripts ([#13724](https://github.com/vercel/vercel/pull/13724))

## 0.0.10

### Patch Changes

- Fix 404 status for /api routes when using Hono with the vercel dev server ([#13706](https://github.com/vercel/vercel/pull/13706))

- Add `.mts` support to node builder ([#13687](https://github.com/vercel/vercel/pull/13687))

- Updated dependencies [[`5eb982e20d82ca22f7e79ea60c288b876fa661e9`](https://github.com/vercel/vercel/commit/5eb982e20d82ca22f7e79ea60c288b876fa661e9), [`ce8eec3bbaca1909abc9f054b7f6e92aed5a343e`](https://github.com/vercel/vercel/commit/ce8eec3bbaca1909abc9f054b7f6e92aed5a343e)]:
  - @vercel/node@5.3.12

## 0.0.9

### Patch Changes

- Support fetchable apps out of the box for Node dev server. ([#13664](https://github.com/vercel/vercel/pull/13664))

  Support CommonJS for Hono

- Updated dependencies [[`a4e72c3c53ddbfccfb31c483ab1e745c68282371`](https://github.com/vercel/vercel/commit/a4e72c3c53ddbfccfb31c483ab1e745c68282371)]:
  - @vercel/node@5.3.11

## 0.0.8

### Patch Changes

- Fix issue where .mjs files weren't transpiled properly for Hono ([#13658](https://github.com/vercel/vercel/pull/13658))

- Updated dependencies [[`b1993ee3af72d12859bbc621744b687fbc968a1b`](https://github.com/vercel/vercel/commit/b1993ee3af72d12859bbc621744b687fbc968a1b)]:
  - @vercel/node@5.3.10

## 0.0.7

### Patch Changes

- Updated dependencies [[`a78f91c2e36e20f3725d758021691fc06a90f0b4`](https://github.com/vercel/vercel/commit/a78f91c2e36e20f3725d758021691fc06a90f0b4)]:
  - @vercel/node@5.3.9

## 0.0.6

### Patch Changes

- Support `server.ts` for hono entrypoint ([#13638](https://github.com/vercel/vercel/pull/13638))

- Fix issue with hono support in monorepos ([#13642](https://github.com/vercel/vercel/pull/13642))

- Updated dependencies [[`003343e128ccb3848a3c966f1f16f0d19df012e8`](https://github.com/vercel/vercel/commit/003343e128ccb3848a3c966f1f16f0d19df012e8)]:
  - @vercel/node@5.3.8

## 0.0.5

### Patch Changes

- Support `vc dev` for hono framework ([#13637](https://github.com/vercel/vercel/pull/13637))

## 0.0.4

### Patch Changes

- Use exact version for @vercel/node instead of workspace ([#13617](https://github.com/vercel/vercel/pull/13617))

## 0.0.3

### Patch Changes

- Force publish ([#13615](https://github.com/vercel/vercel/pull/13615))

## 0.0.2

### Patch Changes

- Adds framework detection and an associated builder for Hono. ([#13594](https://github.com/vercel/vercel/pull/13594))

- Updated dependencies [[`4e1731ead55caeb5e51b45b4dab3a6c9bb1d63e9`](https://github.com/vercel/vercel/commit/4e1731ead55caeb5e51b45b4dab3a6c9bb1d63e9)]:
  - @vercel/node@5.3.7
