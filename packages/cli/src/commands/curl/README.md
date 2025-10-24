# `vercel curl` Command

A passthrough command for `curl` that automatically injects the deployment URL and protection bypass headers for your Vercel deployments.

## Usage

```bash
vercel curl <path> [--deployment <id>] [--protection-bypass <secret>] [-- <curl-args>]
```

### Arguments

- `path` (required): The API path to request (e.g., `/api/hello`)

### Options

- `--deployment`: Target a specific deployment by ID (e.g., `dpl_ERiL45NJvP8ghWxgbvCM447bmxwV` or `ERiL45NJvP8ghWxgbvCM447bmxwV`). The `dpl_` prefix is automatically added if not provided.
- `--protection-bypass`: Protection bypass secret for accessing protected deployments

### Examples

#### Simple GET request

```bash
vercel curl /api/hello
```

#### POST request with data

```bash
vercel curl /api/users -- --request POST --data '{"name": "John"}'
```

#### Target a specific deployment by ID

```bash
vercel curl /api/status --deployment ERiL45NJvP8ghWxgbvCM447bmxwV
```

Or with the `dpl_` prefix:

```bash
vercel curl /api/status --deployment dpl_ERiL45NJvP8ghWxgbvCM447bmxwV
```

#### Use curl flags after the separator

```bash
vercel curl /api/test -- --header "Content-Type: application/json" --request PUT
```

#### Use with protection bypass secret

```bash
vercel curl /api/protected --protection-bypass <secret> -- --request GET
```

## How It Works

1. **Deployment URL**: The command automatically retrieves the URL for your deployment:

   - If `--deployment` is specified with a deployment ID, it fetches that specific deployment's URL
   - Otherwise, it uses the latest production deployment
   - If no production deployment exists, it uses the latest preview deployment
   - The `dpl_` prefix is automatically prepended to the deployment ID if not provided

2. **Protection Bypass**: The command handles deployment protection bypass:

   - If `--protection-bypass` flag is provided, it uses that secret
   - Otherwise, it checks for `VERCEL_AUTOMATION_BYPASS_SECRET` environment variable
   - Attempts to create a new secret via API (may not be supported by all Vercel plans)
   - If unable to get/create a secret, provides instructions for manual creation

3. **Curl Execution**: All arguments after `--` are passed directly to curl, along with:
   - `--url <deployment-url><path>`: The full URL to request
   - `--header "x-vercel-protection-bypass: <secret>"`: Protection bypass header (if available)

## Protection Bypass

To create a Protection Bypass for Automation secret:

1. Visit [https://vercel.com/dashboard](https://vercel.com/dashboard)
2. Go to your project settings → Deployment Protection
3. Generate a "Protection Bypass for Automation" secret
4. Use it with `--protection-bypass` flag or set the `VERCEL_AUTOMATION_BYPASS_SECRET` environment variable

## Example with User's Original Request

```bash
vercel curl \
  /api/ziltoid/visitPlanet \
  --someFlagForVercel valueForTheVercelFlag \
  -- \
  --request POST \
  --data '{
  "nebulo": 9,
  "omniscient": false,
  "ultimateCupOfCoffee": true,
  "time": "6 earth minutes"
}'
```

This will:

1. Get the deployment URL for the current project
2. Construct the full URL: `https://<deployment-url>/api/ziltoid/visitPlanet`
3. Add the `x-vercel-protection-bypass` header if available
4. Execute: `curl --url https://<deployment-url>/api/ziltoid/visitPlanet --header "x-vercel-protection-bypass: <secret>" --request POST --data '...'`
