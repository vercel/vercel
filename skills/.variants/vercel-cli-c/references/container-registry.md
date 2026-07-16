# Container Registry (VCR)

`vercel vcr` manages the Vercel Container Registry — a project-scoped registry for OCI/Docker images served from `vcr.vercel.com`. Every repository belongs to a Vercel project, so commands resolve the target project from the linked project or `--project` (`-p`). Run `vercel vcr --help` (or `vercel vcr <subcommand> --help`) for flags; this file covers behavior help cannot tell you.

A full image reference is:

```txt
vcr.vercel.com/<team-slug>/<project-slug>/<repository>:<tag>
vcr.vercel.com/<team-slug>/<project-slug>/<repository>@sha256:<digest>
```

Repositories, tags, and images are managed with `vcr ls|add|inspect|rm`, `vcr tag ls|inspect`, and `vcr image ls|inspect|rm` respectively.

## Login

`vercel vcr login <engine>` authenticates a local container tool with `vcr.vercel.com` by minting a short-lived project OIDC token and piping it to the engine over stdin (never logged, returned, or placed on the command line). The token logs in as username `oidc` and is valid for ~12 hours — re-run to refresh.

The engine argument is required (no default: `docker`, `podman`, or `buildah`) and the binary must be installed and on your `PATH`; otherwise the command fails fast before any network work. Override the registry host with `VERCEL_VCR_REGISTRY` if needed.

Manual login without the CLI (equivalent, e.g. inside CI where an OIDC token is already present):

```bash
printf '%s' "$VERCEL_OIDC_TOKEN" | docker login vcr.vercel.com --username oidc --password-stdin
```

## Push and Pull

Pushing/pulling is done with your container tool against the full image reference (there is no `vercel vcr push`). VCR creates the repository automatically on first push when the authenticated account has access to the project.

```bash
# zstd compression is recommended for VCR
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --output "type=image,name=vcr.vercel.com/team-slug/project-slug/my-repo:latest,push=true,oci-mediatypes=true,compression=zstd,compression-level=3,force-compression=true" \
  .

docker pull vcr.vercel.com/team-slug/project-slug/my-repo:latest
```

## JSON and Non-Interactive Behavior

- Every subcommand supports `--format json` (`--format`/`--json` are validated together; conflicting values error).
- Destructive commands (`vcr rm`, `vcr image rm`) confirm interactively; pass `--yes` to skip.
- Errors are emitted as structured agent/JSON payloads (`{"status":"error","reason":"…","message":"…"}`) with a suggested `next` command, e.g. `MISSING_ARGUMENTS`, `INVALID_ARGUMENTS`, `ENGINE_NOT_FOUND`, `NOT_AUTHORIZED`.
- List commands paginate with `--limit` and `--cursor` (`-c`); pass the returned cursor to fetch the next page.
