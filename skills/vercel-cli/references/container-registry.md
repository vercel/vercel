# Container Registry

VCR repositories belong to Vercel projects. Resolve the team and project before authenticating or pushing; the image address includes both as `vcr.vercel.com/<team>/<project>/<repository>`.

CLI login obtains a short-lived project OIDC token and sends it to the installed container engine through stdin. Refresh expired authentication rather than persisting the captured token. The engine must be available locally; successful Vercel login alone does not authenticate Docker or another engine to the registry.

Build/push wrappers use the container engine and pass through its output. Do not assume they return the JSON shape used by registry metadata queries.

Use an immutable digest when identifying the exact image deployed; a tag can later point to another image.
