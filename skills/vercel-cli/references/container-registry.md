# Container Registry (VCR)

> Exact syntax: `vercel vcr --help`

Every repository is scoped to a Vercel project; commands resolve the target project from the linked project or `--project` (`-p`). A full image reference is:

```txt
vcr.vercel.com/<team-slug>/<project-slug>/<repository>:<tag>
vcr.vercel.com/<team-slug>/<project-slug>/<repository>@sha256:<digest>
```

## Login

`vercel vcr login <engine>` mints a short-lived project OIDC token and pipes it to the engine over stdin (never logged or placed on the command line). It logs in as username `oidc` and is valid for ~12 hours — re-run to refresh. Override the registry host with `VERCEL_VCR_REGISTRY` if needed.

Equivalent manual login (e.g. in CI where an OIDC token is already present):

```bash
printf '%s' "$VERCEL_OIDC_TOKEN" | docker login vcr.vercel.com --username oidc --password-stdin
```

## Push and Pull

There is no `vercel vcr push` — push and pull with your container tool against the full image reference. VCR creates the repository automatically on first push when the authenticated account has access to the project.

```bash
# zstd compression is recommended for VCR
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --output "type=image,name=vcr.vercel.com/team-slug/project-slug/my-repo:latest,push=true,oci-mediatypes=true,compression=zstd,compression-level=3,force-compression=true" \
  .
```
