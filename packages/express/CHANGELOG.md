# @vercel/express

## 0.0.22

### Patch Changes

- Include source files in build output trace ([#13984](https://github.com/vercel/vercel/pull/13984))

## 0.0.21

### Patch Changes

- Use NodejsLambda instead of Lambda ([#13980](https://github.com/vercel/vercel/pull/13980))

## 0.0.20

### Patch Changes

- Fix issue finding express dep ([#13978](https://github.com/vercel/vercel/pull/13978))

## 0.0.19

### Patch Changes

- Add experimental o11y support for express when `VERCEL_EXPERIMENTAL_EXPRESS_BUILD=1` ([#13963](https://github.com/vercel/vercel/pull/13963))

## 0.0.18

### Patch Changes

- Updated dependencies [[`5eac17d9c045d3c9582d8a69fc1a6ec30fdaa0b0`](https://github.com/vercel/vercel/commit/5eac17d9c045d3c9582d8a69fc1a6ec30fdaa0b0)]:
  - @vercel/node@5.3.24

## 0.0.17

### Patch Changes

- Updated dependencies [[`aaddc91799f5b26a626dd1a7c0e070f334d09be5`](https://github.com/vercel/vercel/commit/aaddc91799f5b26a626dd1a7c0e070f334d09be5)]:
  - @vercel/node@5.3.23

## 0.0.16

### Patch Changes

- Add framework slug and version for Express and Hono builders to build output ([#13918](https://github.com/vercel/vercel/pull/13918))

- Improve error message when entrypoints do not have necessary import ([#13919](https://github.com/vercel/vercel/pull/13919))

## 0.0.15

### Patch Changes

- Updated dependencies [[`d39fd1e138b96509af6b8ebf9cc634f44d1ed38f`](https://github.com/vercel/vercel/commit/d39fd1e138b96509af6b8ebf9cc634f44d1ed38f)]:
  - @vercel/node@5.3.22

## 0.0.14

### Patch Changes

- Updated dependencies [[`db47f7031bacfe0d07e5a657788e1e74c134bf81`](https://github.com/vercel/vercel/commit/db47f7031bacfe0d07e5a657788e1e74c134bf81)]:
  - @vercel/node@5.3.21

## 0.0.13

### Patch Changes

- Support package.json#main field as the entrypoint ([#13846](https://github.com/vercel/vercel/pull/13846))

- Updated dependencies [[`c93f5e6c8563cef8e1f6b6caa6afbe2a43a8af61`](https://github.com/vercel/vercel/commit/c93f5e6c8563cef8e1f6b6caa6afbe2a43a8af61), [`c93f5e6c8563cef8e1f6b6caa6afbe2a43a8af61`](https://github.com/vercel/vercel/commit/c93f5e6c8563cef8e1f6b6caa6afbe2a43a8af61)]:
  - @vercel/node@5.3.20

## 0.0.12

### Patch Changes

- Updated dependencies [[`fea94eea32f9df7c72d9ea95434d84c44f4ef082`](https://github.com/vercel/vercel/commit/fea94eea32f9df7c72d9ea95434d84c44f4ef082)]:
  - @vercel/node@5.3.19

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @vercel/node@5.3.18

## 0.0.10

### Patch Changes

- Add .cts support to express and hono builders ([#13828](https://github.com/vercel/vercel/pull/13828))

- - Expand framework detection to src/app and src/server files. ([#13828](https://github.com/vercel/vercel/pull/13828))
  - Improve handling when multiple entrypoints are detected.
- Updated dependencies [[`2f9a6e68f845ff06c60c7cdab15bb4f4321ac8ed`](https://github.com/vercel/vercel/commit/2f9a6e68f845ff06c60c7cdab15bb4f4321ac8ed), [`dc0dedda5d8c5657ae03d3a69b855e02abba5797`](https://github.com/vercel/vercel/commit/dc0dedda5d8c5657ae03d3a69b855e02abba5797), [`a6ac37a8f1f12bb94725fafbeb09e3a58fea6603`](https://github.com/vercel/vercel/commit/a6ac37a8f1f12bb94725fafbeb09e3a58fea6603)]:
  - @vercel/node@5.3.17

## 0.0.9

### Patch Changes

- Updated dependencies [[`6260486192ca407fc2d91f317ed81533548b8629`](https://github.com/vercel/vercel/commit/6260486192ca407fc2d91f317ed81533548b8629)]:
  - @vercel/static-config@3.1.2
  - @vercel/node@5.3.16

## 0.0.8

### Patch Changes

- Add support for specifying an output directory for Express and Hono apps ([#13805](https://github.com/vercel/vercel/pull/13805))

- Updated dependencies [[`9cc5e3a04f4158545e55a9c0c66c13ac51db1ce1`](https://github.com/vercel/vercel/commit/9cc5e3a04f4158545e55a9c0c66c13ac51db1ce1), [`0985931965d9ba8f2a0198f34a4a4838c341769a`](https://github.com/vercel/vercel/commit/0985931965d9ba8f2a0198f34a4a4838c341769a)]:
  - @vercel/node@5.3.15

## 0.0.7

### Patch Changes

- Add support for app.js as a server entrypoint ([#13798](https://github.com/vercel/vercel/pull/13798))

- Updated dependencies []:
  - @vercel/node@5.3.14

## 0.0.6

### Patch Changes

- Updated dependencies [[`bebaf76f5df3e640c96d913049588c7ab741719b`](https://github.com/vercel/vercel/commit/bebaf76f5df3e640c96d913049588c7ab741719b)]:
  - @vercel/node@5.3.13

## 0.0.5

### Patch Changes

- Make express public ([#13748](https://github.com/vercel/vercel/pull/13748))

## 0.0.4

### Patch Changes

- Include support for custom build scripts for backend builders ([#13739](https://github.com/vercel/vercel/pull/13739))

## 0.0.3

### Patch Changes

- Include `@vercel/express` in the Vercel CLI ([#13716](https://github.com/vercel/vercel/pull/13716))

## 0.0.2

### Patch Changes

- Add builder for Express.js ([#13711](https://github.com/vercel/vercel/pull/13711))

- Updated dependencies [[`5eb982e20d82ca22f7e79ea60c288b876fa661e9`](https://github.com/vercel/vercel/commit/5eb982e20d82ca22f7e79ea60c288b876fa661e9), [`ce8eec3bbaca1909abc9f054b7f6e92aed5a343e`](https://github.com/vercel/vercel/commit/ce8eec3bbaca1909abc9f054b7f6e92aed5a343e)]:
  - @vercel/node@5.3.12
