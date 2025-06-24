# @vercel/routing-utils

## 5.0.8

### Patch Changes

- support transform rules in vercel.json ([#13464](https://github.com/vercel/vercel/pull/13464))

## 5.0.7

### Patch Changes

- Fixed TS literal type inference for compatibility with json-schema-to-ts ([#13446](https://github.com/vercel/vercel/pull/13446))

## 5.0.6

### Patch Changes

- Adds support for conditionValues for `has` and `missing` and `mitigate` in your `vercel.json` file. ([#13409](https://github.com/vercel/vercel/pull/13409))

## 5.0.5

### Patch Changes

- Revert "[routing-utils] Support Conditions and Mitigate in vercel.json" ([#13400](https://github.com/vercel/vercel/pull/13400))

## 5.0.4

### Patch Changes

- [routing-utils] fix dep bundling ([#13026](https://github.com/vercel/vercel/pull/13026))

## 5.0.3

### Patch Changes

- better path-to-regexp diff logging ([#12962](https://github.com/vercel/vercel/pull/12962))

## 5.0.2

### Patch Changes

- Update routes schema for new limit of 2048 ([#12968](https://github.com/vercel/vercel/pull/12968))

## 5.0.1

### Patch Changes

- log diff between current and updated versions of path-to-regexp ([#12926](https://github.com/vercel/vercel/pull/12926))

## 5.0.0

### Major Changes

- [remix-builder][node][routing-utils] revert path-to-regexp updates ([#12746](https://github.com/vercel/vercel/pull/12746))

## 4.0.0

### Major Changes

- update path-to-regexp ([#12734](https://github.com/vercel/vercel/pull/12734))

## 3.1.0

### Minor Changes

- Adds support for statusCode property on rewrites ([#10495](https://github.com/vercel/vercel/pull/10495))

## 3.0.0

### Major Changes

- BREAKING CHANGE: Drop Node.js 14, bump minimum to Node.js 16 ([#10369](https://github.com/vercel/vercel/pull/10369))
