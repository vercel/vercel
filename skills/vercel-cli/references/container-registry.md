# Container Registry (VCR)

`vercel vcr` manages the Vercel Container Registry — a project-scoped registry for OCI/Docker images served from `vcr.vercel.com`. Every repository belongs to a Vercel project, so commands resolve the target project from the linked project or `--project` (`-p`). Run `vercel vcr --help` (or `vercel vcr <subcommand> --help`) for the current flag list.

A full image reference is:

```txt
vcr.vercel.com/<team-slug>/<project-slug>/<repository>:<tag>
vcr.vercel.com/<team-slug>/<project-slug>/<repository>@sha256:<digest>
```

## Repositories

```bash
vercel vcr ls                                   # list repositories in the linked project (alias: list)
vercel vcr ls --project my-app --format json    # list for a specific project as JSON
vercel vcr inspect my-repository                # show one repository (alias: get)
vercel vcr add my-repository                    # create a repository (alias: create)
vercel vcr rm my-repository                     # delete a repository (aliases: remove, delete)
vercel vcr rm my-repository --yes               # delete without the confirmation prompt
```

## Tags

```bash
vercel vcr tag ls my-app                                 # list a repository's tags (alias: tags; ls alias: list)
vercel vcr tag ls my-app --sort-by tag --sort-order asc  # sort (sort-by: updatedAt|tag, sort-order: asc|desc)
vercel vcr tag inspect my-app latest                     # show one tag (alias: get)
```

## Images

```bash
vercel vcr image ls my-app                          # list images in a repository (alias: images; ls alias: list)
vercel vcr image ls my-app --untagged --format json # only images with no tags, as JSON
vercel vcr image inspect my-app img_abc123          # show one image incl. layer history (alias: get)
vercel vcr image rm my-app img_abc123               # delete an image (aliases: remove, delete)
vercel vcr image rm my-app img_abc123 --yes         # delete without the confirmation prompt
```

## Login

`vercel vcr login <engine>` authenticates a local container tool with `vcr.vercel.com` by minting a short-lived project OIDC token and piping it to the engine over stdin (never logged, returned, or placed on the command line). The token logs in as username `oidc` and is valid for ~12 hours — re-run to refresh.

```bash
vercel vcr login docker                  # engine is required: docker | podman | buildah
vercel vcr login podman
vercel vcr login docker --project my-app # log in for a specific project
```

The engine argument is required (no default) and the binary must be installed and on your `PATH`; otherwise the command fails fast before any network work. Override the registry host with `VERCEL_VCR_REGISTRY` if needed.

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
