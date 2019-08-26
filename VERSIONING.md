# Versioning

Builders are released to two different channels.

## Channels

| Channel | Git Branch                                                    | npm dist-tag | use example        |
| ------- | ------------------------------------------------------------- | ------------ | ------------------ |
| Canary  | [canary](https://github.com/zeit/now-builders/commits/canary) | `@canary`    | `@now/node@canary` |
| Stable  | [master](https://github.com/zeit/now-builders/commits/master) | `@latest`    | `@now/node@latest` |

All PRs are submitted to the `canary` branch. Once a PR is merged into the `canary` branch, it should be published to npm immediately using the Canary Channel.

## Version Selection

Since Builders are published to [npmjs.com](https://npmjs.com), this makes versioning works the same for Builders as it does for any npm package. The `use` statement in [now.json](https://zeit.co/docs/v2/advanced/configuration#builds) has a similar syntax to `npm install`.

The following are valid examples [@now/node](https://www.npmjs.com/package/@now/node?activeTab=versions):

- `@now/node`
- `@now/node@0.7.3`
- `@now/node@canary`
- `@now/node@0.7.2-canary.2`

We always recommend using the latest version by leaving off the dist-tag suffix, `@now/node` for example.
