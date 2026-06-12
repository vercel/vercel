---
'vercel': patch
---

The CLI's update notifier now respects the `registry` configured in `.npmrc` files (project, user, and global) and the `npm_config_registry` environment variable, instead of always hitting `registry.npmjs.org`. This unblocks update notifications in environments where the public npm registry is firewalled and an internal mirror is configured.
