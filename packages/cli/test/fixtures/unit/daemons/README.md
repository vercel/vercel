# Daemon

A static site with a top-level `daemons` entry that builds `daemon/Dockerfile` and logs a heartbeat without opening a port. `vercel build` builds the site as usual, pushes the daemon image, and writes `.vercel/output/daemons/heartbeat/.vc-config.json`. Daemon builds require `VERCEL_ENABLE_DAEMONS_BOA=1`.
