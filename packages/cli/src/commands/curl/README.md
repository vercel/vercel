# `vercel curl` Command

A passthrough command for `curl` that can target Vercel deployments, aliases, or linked-project paths while adding deployment protection authentication when available.

## Usage

```bash
vercel curl <url|path> [vc-options] [curl-args]
```

### Targets

- **Relative path**: `/api/hello` or `api/hello` targets the linked project's preferred deployment URL.
- **Full URL**: `https://my-app.vercel.app/api/hello` is passed through as the request URL.
- **Bare hostname**: `my-app.vercel.app/api/hello` is treated as `https://my-app.vercel.app/api/hello`.

### Vercel Options

- **`--deployment <id|url>`**: For relative paths, target a specific deployment by ID or URL.
- **`--protection-bypass <secret>`**: Use a manually provided protection bypass secret instead of OIDC auth.
- **`--yes`**: Skip confirmation when linking is required.
- **`--help`**: Display help information.

### Curl Arguments

Curl arguments can be passed directly after the target:

```bash
vercel curl /api/users --request POST --header "Content-Type: application/json" --data '{"name":"John"}'
```

Put the target first, or use curl's `--url <target>` option. `vercel curl` does not try to parse arbitrary curl options before the target.

The legacy `--` separator still works:

```bash
vercel curl /api/users -- --request POST --data '{"name":"John"}'
```

## Examples

### Linked Project Path

```bash
vercel curl /api/hello
```

Equivalent to:

```bash
curl --url https://your-project.vercel.app/api/hello \
  --header "x-vercel-trusted-oidc-idp-token: <oidc-token>"
```

### Deployment URL or Alias

```bash
vercel curl https://your-project.vercel.app/api/hello
vercel curl custom-domain.example.com/api/hello
```

For full URLs, the CLI attempts to resolve the host as a deployment URL or alias across accessible teams, then pulls the target project's OIDC token.

### POST Request

```bash
vercel curl /api/users \
  --request POST \
  --header "Content-Type: application/json" \
  --data '{"name":"John","email":"john@example.com"}'
```

### Specific Deployment

```bash
vercel curl /api/status --deployment ERiL45NJvP8ghWxgbvCM447bmxwV
vercel curl /api/status --deployment dpl_ERiL45NJvP8ghWxgbvCM447bmxwV
vercel curl /api/status --deployment https://your-project-abc123.vercel.app
```

### Manual Protection Bypass Secret

```bash
vercel curl /api/protected --protection-bypass your-secret-key
```

## Authentication

By default, `vercel curl` pulls `VERCEL_OIDC_TOKEN` for the resolved project and sends it as:

```text
x-vercel-trusted-oidc-idp-token: <oidc-token>
```

If `--protection-bypass` is provided, it sends the manual fallback header instead:

```text
x-vercel-protection-bypass: <secret>
```

If no OIDC token is available, the command still runs without an auth header. This keeps unprotected deployments and public URLs usable.

## Requirements

- **curl**: Must be installed and available in your system PATH.
- **Vercel project**: Required for relative paths; full URLs can be used without a linked project, but linked-project OIDC auth is used as a fallback.
- **Deployment**: Relative paths require at least one deployment for the linked project.
