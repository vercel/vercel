# Platform Operations

> Exact syntax: `vercel alerts --help`, `vercel usage --help`, `vercel contract --help`, `vercel buy --help`, `vercel tokens --help`, `vercel telemetry --help`, `vercel upgrade --help`

- Billing and purchase commands can change paid account state. Get explicit user confirmation before running mutations such as `vercel buy ...`.
- `vercel upgrade` changes the installed global CLI. Prefer the project-pinned CLI or package-manager invocation when one exists, unless the user asked to update a global install.
