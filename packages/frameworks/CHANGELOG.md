# @vercel/frameworks

## 1.5.0

### Minor Changes

- Add `ignorePackageJsonScript` configuration for Framework command settings to ignore the `package.json` script. ([#10228](https://github.com/vercel/vercel/pull/10228))

  Enable this mode for Storybook's `buildCommand`, since it should not invoke the "build" script, which is most likely designated for the frontend app build.

## 1.4.3

### Patch Changes

- [frameworks] Update `saber.land` to `saber.egoist.dev` ([#10148](https://github.com/vercel/vercel/pull/10148))
