# `vercel httpstat` Command

A powerful passthrough command for `httpstat` that simplifies testing and analyzing HTTP timing statistics for your Vercel deployments by automatically handling deployment URLs and protection bypass authentication.

## Why Use This?

Testing API endpoints on Vercel deployments typically requires:

- Finding the deployment URL manually
- Managing protection bypass secrets
- Constructing full URLs with proper headers

`vercel httpstat` automates all of this while providing beautiful visual timing statistics, letting you focus on analyzing your API performance.

## What is httpstat?

`httpstat` is a visualization tool that beautifully displays timing breakdown of HTTP requests:

- DNS lookup time
- TCP connection time
- TLS handshake time
- Server processing time
- Content transfer time

It's like `curl -w` but with a much better user experience.

## Usage

```bash
vercel httpstat <path> [options] [-- <httpstat-args>]
```

### Arguments

- **`path`** (required): The API path to request
  - Can start with `/` (e.g., `/api/hello`) or without (e.g., `api/hello`)
  - Automatically normalized to include leading slash

### Options

- **`--deployment <id>`**: Target a specific deployment by ID

  - Accepts IDs with or without the `dpl_` prefix
  - Examples: `dpl_ERiL45NJvP8ghWxgbvCM447bmxwV` or `ERiL45NJvP8ghWxgbvCM447bmxwV`
  - The `dpl_` prefix is automatically added if omitted

- **`--protection-bypass <secret>`**: Provide a protection bypass secret

  - Required for deployments with Vercel Protection enabled
  - Alternatively, set the `VERCEL_AUTOMATION_BYPASS_SECRET` environment variable

- **`--help`**: Display help information

### Httpstat Arguments

All arguments after `--` are passed directly to the `httpstat` command:

```bash
vercel httpstat /api/endpoint -- -X POST -H "Content-Type: application/json" -d '{"key":"value"}'
```

## Examples

### Basic GET Request with Timing Stats

```bash
vercel httpstat /api/hello
```

Shows timing breakdown for:

```
DNS Lookup   TCP Connection   TLS Handshake   Server Processing   Content Transfer
[  12ms  |     45ms      |      89ms     |       123ms       |       8ms      ]
             |                |               |                   |                |
    namelookup:12ms          |               |                   |                |
                        connect:57ms          |                   |                |
                                    pretransfer:146ms             |                |
                                                      starttransfer:269ms          |
                                                                                total:277ms
```

### POST Request with JSON Data

```bash
vercel httpstat /api/users -- \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"name": "John", "email": "john@example.com"}'
```

### Target a Specific Deployment

```bash
# Test a specific deployment by ID
vercel httpstat /api/status --deployment ERiL45NJvP8ghWxgbvCM447bmxwV

# Or with the dpl_ prefix
vercel httpstat /api/status --deployment dpl_ERiL45NJvP8ghWxgbvCM447bmxwV
```

### Custom Headers and Methods

```bash
vercel httpstat /api/test -- \
  -X PUT \
  -H "Content-Type: application/json" \
  -H "X-Custom-Header: value" \
  -d '{"updated": true}'
```

### Using Your Own Protection Bypass Secret

```bash
vercel httpstat /api/protected \
  --protection-bypass your-secret-key \
  -- -X GET
```

### Performance Testing Example

```bash
vercel httpstat /api/slow-endpoint
```

This will help you identify:

- DNS resolution issues
- Network latency
- SSL/TLS overhead
- Server processing bottlenecks
- Content transfer speed

## How It Works

The command follows this workflow:

### 1. Deployment URL Resolution

The target deployment URL is determined automatically:

- **With `--deployment` flag**: Fetches the specified deployment's URL

  - The `dpl_` prefix is automatically added if not provided
  - Example: `ERiL45NJvP8ghWxgbvCM447bmxwV` → `dpl_ERiL45NJvP8ghWxgbvCM447bmxwV`

- **Without `--deployment` flag**: Uses the latest deployment from your linked project
  - Prefers the most recent production deployment
  - Falls back to the latest preview deployment if no production exists

### 2. Protection Bypass Handling

For deployments with Vercel Protection enabled, the command automatically manages authentication:

**Priority order:**

1. `--protection-bypass` flag value (if provided)
2. `VERCEL_AUTOMATION_BYPASS_SECRET` environment variable
3. Existing automation bypass token from project settings
4. Attempts to create a new automation bypass token via API

If automatic token creation fails, you'll see instructions for manual setup.

### 3. Request Execution with Timing

The command constructs and executes the httpstat command with:

- **Target URL**: `https://<deployment-url><path>`
- **Protection header**: `x-vercel-protection-bypass: <secret>` (if available)
- **Your httpstat args**: All arguments after `--` are passed directly to httpstat

## Installation

### Install httpstat

Before using `vercel httpstat`, you need to have `httpstat` installed:

#### macOS (Homebrew)

```bash
brew install httpstat
```

#### Python (pip)

```bash
pip install httpstat
```

#### Node.js (npm)

```bash
npm install -g httpstat
```

#### From Source

```bash
curl -o httpstat https://raw.githubusercontent.com/reorx/httpstat/master/httpstat.py
chmod +x httpstat
sudo mv httpstat /usr/local/bin/
```

For more installation options, visit: https://github.com/reorx/httpstat

## Protection Bypass Setup

### Automatic (Recommended)

The command will attempt to create an automation bypass token automatically. This works for most Vercel plans.

### Manual Setup

If automatic creation isn't available or fails:

1. **Navigate to your project**:

   - Visit [https://vercel.com/dashboard](https://vercel.com/dashboard)
   - Select your project

2. **Access Deployment Protection settings**:

   - Go to **Settings** → **Deployment Protection**

3. **Generate automation bypass secret**:

   - Look for "Protection Bypass for Automation"
   - Click "Create" or "Generate" to create a new secret
   - Copy the generated secret

4. **Use the secret**:

   Option A - With the flag:

   ```bash
   vercel httpstat /api/endpoint --protection-bypass your-secret-here
   ```

   Option B - With environment variable:

   ```bash
   export VERCEL_AUTOMATION_BYPASS_SECRET=your-secret-here
   vercel httpstat /api/endpoint
   ```

## Troubleshooting

### "httpstat command not found"

Ensure `httpstat` is installed on your system. See the Installation section above.

### "No deployment found for the project"

Make sure:

- You're in a directory with a linked Vercel project (run `vercel link` if needed)
- Your project has at least one deployment (run `vercel deploy` to create one)

### "Failed to get deployment protection bypass token"

This means automatic token creation failed. Follow the manual setup steps above to create a protection bypass secret.

### "No deployment found for ID"

When using `--deployment`:

- Verify the deployment ID is correct
- Check that the deployment belongs to your linked project
- Ensure the deployment hasn't been deleted

## Comparison with `vercel curl`

| Feature              | `vercel curl`              | `vercel httpstat`                          |
| -------------------- | -------------------------- | ------------------------------------------ |
| Purpose              | Execute HTTP requests      | Execute HTTP requests with timing analysis |
| Visual Output        | Standard curl output       | Beautiful timing visualization             |
| Performance Analysis | Manual with `-w` flag      | Automatic with detailed breakdown          |
| URL Management       | ✅ Automatic               | ✅ Automatic                               |
| Protection Bypass    | ✅ Automatic               | ✅ Automatic                               |
| Use Case             | General HTTP requests      | Performance testing and debugging          |
| Dependencies         | curl (usually preinstalled) | httpstat (requires installation)           |

## Use Cases

1. **Performance Debugging**: Identify slow endpoints and where the bottleneck is
2. **API Testing**: Test API endpoints with detailed timing information
3. **Network Analysis**: Understand network latency and connection issues
4. **TLS/SSL Analysis**: Measure TLS handshake time
5. **CDN Performance**: Analyze edge caching and content delivery times

## Requirements

- **httpstat**: Must be installed and available in your system PATH
- **Linked Project**: Your directory must be linked to a Vercel project
- **Active Deployment**: Project must have at least one deployment

## Tips

- Use `vercel httpstat` for performance analysis and timing breakdown
- Use `vercel curl` for general HTTP requests and scripting
- Combine with other tools like `watch` for continuous monitoring:
  ```bash
  watch -n 5 vercel httpstat /api/endpoint
  ```

