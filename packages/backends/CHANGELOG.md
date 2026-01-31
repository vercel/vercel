# @vercel/backends

## 0.0.25

### Patch Changes

- Improve handling of cjs/esm interop during imports ([#14798](https://github.com/vercel/vercel/pull/14798))

## 0.0.24

### Patch Changes

- Improve handling of cjs/esm interop during imports ([#14730](https://github.com/vercel/vercel/pull/14730))

- Updated dependencies [[`3df0f7787542be38aa74f3ccfa744a724a6dde80`](https://github.com/vercel/vercel/commit/3df0f7787542be38aa74f3ccfa744a724a6dde80)]:
  - @vercel/cervel@0.0.11
  - @vercel/introspection@0.0.10

## 0.0.23

### Patch Changes

- Add tracing for backends builder usage ([#14671](https://github.com/vercel/vercel/pull/14671))

- Updated dependencies [[`6782a7a16c33dd56873a78a687f0ab4870466fc7`](https://github.com/vercel/vercel/commit/6782a7a16c33dd56873a78a687f0ab4870466fc7), [`31a5321f0914f09236d1100c962dfeb201885302`](https://github.com/vercel/vercel/commit/31a5321f0914f09236d1100c962dfeb201885302), [`8e4b946e795ae36f7b9984edbc5d8cd4887e6fc4`](https://github.com/vercel/vercel/commit/8e4b946e795ae36f7b9984edbc5d8cd4887e6fc4)]:
  - @vercel/introspection@0.0.10
  - @vercel/cervel@0.0.10

## 0.0.22

### Patch Changes

- - Parrallelize NFT and introspection steps ([#14619](https://github.com/vercel/vercel/pull/14619))
  - Increase timeout to 8 seconds. It's taking up to 5 seconds for a large app we have been testing with
  - Add more debug logs to introspection process
- Updated dependencies [[`2763c6ce1c5e0181eb97817bb79d793c7ad13a19`](https://github.com/vercel/vercel/commit/2763c6ce1c5e0181eb97817bb79d793c7ad13a19)]:
  - @vercel/introspection@0.0.9

## 0.0.21

### Patch Changes

- Remove getSpawnOptions ([#14604](https://github.com/vercel/vercel/pull/14604))

- Updated dependencies []:
  - @vercel/introspection@0.0.8

## 0.0.20

### Patch Changes

- Replace getNodeVersion with getRuntimeNodeVersion ([#14600](https://github.com/vercel/vercel/pull/14600))

- Updated dependencies []:
  - @vercel/introspection@0.0.8

## 0.0.19

### Patch Changes

- Remove unnecessary dependency ([#14564](https://github.com/vercel/vercel/pull/14564))

- Cleanup esbuild and rolldown dependencies ([#14577](https://github.com/vercel/vercel/pull/14577))

- Ensure internal build step runs if a build script is missing ([#14564](https://github.com/vercel/vercel/pull/14564))

- Updated dependencies [[`239b4181e311b43cdd705376c27e83466295be2f`](https://github.com/vercel/vercel/commit/239b4181e311b43cdd705376c27e83466295be2f), [`6d3c5b66324221f33290022897674af54461333e`](https://github.com/vercel/vercel/commit/6d3c5b66324221f33290022897674af54461333e)]:
  - @vercel/cervel@0.0.9
  - @vercel/introspection@0.0.8

## 0.0.18

### Patch Changes

- Updated dependencies [[`65d137b939883f468712f61570f6e6182fd39b27`](https://github.com/vercel/vercel/commit/65d137b939883f468712f61570f6e6182fd39b27)]:
  - @vercel/introspection@0.0.8
  - @vercel/cervel@0.0.8

## 0.0.17

### Patch Changes

- Upgrade rolldown ([#14446](https://github.com/vercel/vercel/pull/14446))

- Updated dependencies [[`bc36a99aac6d9400ad158890e54a4e9f7a49d91d`](https://github.com/vercel/vercel/commit/bc36a99aac6d9400ad158890e54a4e9f7a49d91d)]:
  - @vercel/cervel@0.0.7
  - @vercel/introspection@0.0.7

## 0.0.16

### Patch Changes

- Updated dependencies [[`d6d8776c54836244dc8e1c0fc3b1f884fced98a8`](https://github.com/vercel/vercel/commit/d6d8776c54836244dc8e1c0fc3b1f884fced98a8)]:
  - @vercel/introspection@0.0.7

## 0.0.15

### Patch Changes

- Use `workspace:*` for workspace dependencies ([#14396](https://github.com/vercel/vercel/pull/14396))

- Updated dependencies [[`6bdbf9e170507a973a53bd881c8c7ecbaa3a930c`](https://github.com/vercel/vercel/commit/6bdbf9e170507a973a53bd881c8c7ecbaa3a930c), [`2c0cdad76930441f92efedcc27a15eb22a2509a3`](https://github.com/vercel/vercel/commit/2c0cdad76930441f92efedcc27a15eb22a2509a3)]:
  - @vercel/introspection@0.0.6

## 0.0.14

### Patch Changes

- Bump NFT dependency ([#14373](https://github.com/vercel/vercel/pull/14373))

- Updated dependencies [[`f9b8fb23d1d2f873c5c3a0534b12d1e463689bb6`](https://github.com/vercel/vercel/commit/f9b8fb23d1d2f873c5c3a0534b12d1e463689bb6)]:
  - @vercel/introspection@0.0.5

## 0.0.13

### Patch Changes

- Disables auto instrumentation when the app has manual instrumentation setup ([#14345](https://github.com/vercel/vercel/pull/14345))

- Updated dependencies []:
  - @vercel/introspection@0.0.4

## 0.0.12

### Patch Changes

- Update NFT dependency ([#14357](https://github.com/vercel/vercel/pull/14357))

- Updated dependencies [[`e2b3a0b0a939f09d8fdefc8d493733defac4997a`](https://github.com/vercel/vercel/commit/e2b3a0b0a939f09d8fdefc8d493733defac4997a)]:
  - @vercel/introspection@0.0.4

## 0.0.11

### Patch Changes

- Updated dependencies [[`a9340f6f5022eed96d1e42344b5bb67f1239ca41`](https://github.com/vercel/vercel/commit/a9340f6f5022eed96d1e42344b5bb67f1239ca41)]:
  - @vercel/introspection@0.0.3

## 0.0.10

### Patch Changes

- Add bun detection for experimental backends ([#14311](https://github.com/vercel/vercel/pull/14311))

- Updated dependencies [[`10de9d8d6ebdef57f4b0ca7dabc277651b317d7c`](https://github.com/vercel/vercel/commit/10de9d8d6ebdef57f4b0ca7dabc277651b317d7c)]:
  - @vercel/cervel@0.0.6
  - @vercel/introspection@0.0.2

## 0.0.9

### Patch Changes

- Updated dependencies [[`06a9b9a8281fa327e9f04a689d512f09eb85201d`](https://github.com/vercel/vercel/commit/06a9b9a8281fa327e9f04a689d512f09eb85201d)]:
  - @vercel/cervel@0.0.5
  - @vercel/introspection@0.0.2

## 0.0.8

### Patch Changes

- Fix build issue with experimental backends builder ([#14281](https://github.com/vercel/vercel/pull/14281))

- Updated dependencies [[`cf1183cb80e407238af2dd2a8d5e605f621c5d91`](https://github.com/vercel/vercel/commit/cf1183cb80e407238af2dd2a8d5e605f621c5d91)]:
  - @vercel/cervel@0.0.4
  - @vercel/introspection@0.0.2

## 0.0.7

### Patch Changes

- Revert "Remove getSpawnOptions" ([#14261](https://github.com/vercel/vercel/pull/14261))

## 0.0.6

### Patch Changes

- Pull introspection module out of backends for external use ([#14210](https://github.com/vercel/vercel/pull/14210))

- Updated dependencies [[`62651e302de8c2913b658b5cfd5c9e1dd192a03c`](https://github.com/vercel/vercel/commit/62651e302de8c2913b658b5cfd5c9e1dd192a03c)]:
  - @vercel/introspection@0.0.2

## 0.0.5

### Patch Changes

- Remove getSpawnOptions ([#14176](https://github.com/vercel/vercel/pull/14176))

## 0.0.4

### Patch Changes

- Move tsdown to dev dep ([#14157](https://github.com/vercel/vercel/pull/14157))

- Updated dependencies [[`2de7ca658769b3d4d3c38c5194bb75a63bd895a4`](https://github.com/vercel/vercel/commit/2de7ca658769b3d4d3c38c5194bb75a63bd895a4)]:
  - @vercel/cervel@0.0.3

## 0.0.3

### Patch Changes

- Fix dependency ([#14148](https://github.com/vercel/vercel/pull/14148))

- Support sub-apps for Hono's experimental o11y ([#14148](https://github.com/vercel/vercel/pull/14148))

## 0.0.2

### Patch Changes

- Replace experimental builders for Express and Hono with a @vercel/backends package ([#14065](https://github.com/vercel/vercel/pull/14065))

- Updated dependencies [[`c6cf33d7db28f858d7e34d08ec871a28423ded2a`](https://github.com/vercel/vercel/commit/c6cf33d7db28f858d7e34d08ec871a28423ded2a), [`c6cf33d7db28f858d7e34d08ec871a28423ded2a`](https://github.com/vercel/vercel/commit/c6cf33d7db28f858d7e34d08ec871a28423ded2a)]:
  - @vercel/cervel@0.0.2
