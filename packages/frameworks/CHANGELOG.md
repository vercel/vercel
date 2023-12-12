# @vercel/frameworks

## 2.0.5

### Patch Changes

- This new screenshot matches the template. It removes the version number so this screenshot will not go stale. ([#10921](https://github.com/vercel/vercel/pull/10921))

## 2.0.4

### Patch Changes

- Update placeholder for Nuxt to be correct command. ([#10873](https://github.com/vercel/vercel/pull/10873))

## 2.0.3

### Patch Changes

- update Angular output path discovery ([#10678](https://github.com/vercel/vercel/pull/10678))

- Updated dependencies [[`34dd9c091`](https://github.com/vercel/vercel/commit/34dd9c0918585cf6d3b04bddd9158978b0b4192f)]:
  - @vercel/error-utils@2.0.2

## 2.0.2

### Patch Changes

- Add `bun install` placeholder ([#10492](https://github.com/vercel/vercel/pull/10492))

## 2.0.1

### Patch Changes

- move some frameworks deps to dependencies ([#10380](https://github.com/vercel/vercel/pull/10380))

- Updated dependencies [[`96f99c714`](https://github.com/vercel/vercel/commit/96f99c714715651b85eb7a03f58ecc9e1316d156)]:
  - @vercel/error-utils@2.0.1

## 2.0.0

### Major Changes

- BREAKING CHANGE: Drop Node.js 14, bump minimum to Node.js 16 ([#10369](https://github.com/vercel/vercel/pull/10369))

### Minor Changes

- Add "supersedes" prop to Framework interface ([#10345](https://github.com/vercel/vercel/pull/10345))

## 1.6.0

### Minor Changes

- [frameworks] Amend Hugo default `buildCommand` to exclude drafts enabled flag ([#7326](https://github.com/vercel/vercel/pull/7326))

## 1.5.1

### Patch Changes

- Add "(v1)" suffix to "hydrogen" preset ([#10320](https://github.com/vercel/vercel/pull/10320))

- Use parenthesis on Docusaurus "name" fields ([#10324](https://github.com/vercel/vercel/pull/10324))

## 1.5.0

### Minor Changes

- Add `ignorePackageJsonScript` configuration for Framework command settings to ignore the `package.json` script. ([#10228](https://github.com/vercel/vercel/pull/10228))

  Enable this mode for Storybook's `buildCommand`, since it should not invoke the "build" script, which is most likely designated for the frontend app build.

## 1.4.3

### Patch Changes

- [frameworks] Update `saber.land` to `saber.egoist.dev` ([#10148](https://github.com/vercel/vercel/pull/10148))
