---
'vercel': patch
---

Fixed scope resolution for Northstar accounts whose username collides with the slug of their default team.

- Commands now scope API requests to the Northstar default team on every invocation, not just at login. Previously the default team was resolved for display (`vc whoami` showing "Active team: my-user") while requests were sent with no `teamId`, silently scoping to the resource-less personal account. This caused commands like `vc projects ls` to report "No projects found" even though the team has projects.
- `--scope <name>` now resolves against the user's teams before falling back to personal-account handling. A team whose slug matches the user's username (e.g. a Northstar default team) can now be selected by name instead of being rejected with "You cannot set your Personal Account as the scope."
