---
'vercel': patch
---

Added an experimental managed CLI store (enable with `VERCEL_CLI_STORE=1`). `vercel upgrade` downloads the target version's tarball directly from the npm registry, verifies its integrity against the registry's published checksum, extracts it into a self-owned directory (`~/.vercel/cli/versions/<version>/`), and atomically updates a pointer file. The CLI entrypoint transparently runs the store's version when it is newer than the invoked install, and a background worker seeds the store with the running version when it is newer than the pointer (rate-limited, monotonic — seeding can never downgrade the pointer), so installs across package managers and Node versions converge on the newest version without explicit upgrades. Store operations never invoke a package manager against the user's environment and never need to detect how the CLI was installed. Native binary installs are excluded for now; the store's pointer format reserves a payload type for them.
