# @vercel/frameworks

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
