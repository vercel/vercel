# Project Infrastructure

> Exact syntax: `vercel rolling-release --help`, `vercel deploy-hooks --help`, `vercel crons --help`, `vercel cache --help`, `vercel git --help`, `vercel edge-config --help`, `vercel redirects --help`, `vercel target --help`

- `vercel crons add` writes to `vercel.json`; do not run it when the user only asked for inspection.
- Deploy hook URLs can trigger deployments. Treat them as secrets when presenting output.
- Edge Config token values and config contents may be sensitive. Avoid broad dumps unless needed.
- Routing and redirect changes have separate command groups. Route changes are staged before `vercel routes publish` (see `references/routing.md` for route-rule syntax); redirect changes use redirect versions and promotion under `vercel redirects`.
- `vercel target` lists custom environments. `deploy` and `build` accept `--target`; `pull` accepts `--environment` (not `--target`).
- There is no `vercel rr status` command; use `vercel rr fetch` for current details.
