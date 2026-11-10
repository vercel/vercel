# Microfrontends

The default app owns `microfrontends.json` and serves unmatched requests. Child apps deploy independently, but routing configuration changes take effect only after deploying the default app to production.

Inspect group membership before changing it. Removing a child requires removing its configuration entry too; otherwise the next default-app deployment can retain broken routing. The default app must be changed in the dashboard before removing that project from the group.

Group changes that cross a billing limit can require interactive confirmation. Preserve that handoff rather than trying to force a non-interactive path. Group deletion removes every project from the group.

For local development, the proxy needs the default app's configuration. In a polyrepo, fetch it or provide its local path. Run local apps on the ports expected by the proxy; apps not running locally can fall back to production, so confirm where requests are going before treating a test as local-only.
