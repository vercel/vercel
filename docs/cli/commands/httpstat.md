# vercel httpstat

Execute httpstat with automatic deployment URL and protection bypass to visualize HTTP timing statistics.

## Synopsis

```bash
vercel httpstat <path> [options] [-- <curl-args>]
```

## Description

The `httpstat` command provides detailed HTTP timing statistics for your Vercel deployments. It shows a visual breakdown of:

- DNS lookup time
- TCP connection time
- TLS handshake time
- Server processing time (Time to First Byte)
- Content transfer time

Like `vercel curl`, it automatically handles deployment URL resolution and protection bypass.

## Arguments

| Argument | Required | Description                                  |
| -------- | -------- | -------------------------------------------- |
| `path`   | Yes      | The API path to request (e.g., `/api/hello`) |

## Options

| Option                | Type   | Description                                        |
| --------------------- | ------ | -------------------------------------------------- |
| `--deployment`        | String | Target a specific deployment by ID or URL          |
| `--protection-bypass` | String | Protection bypass secret for protected deployments |

### `--deployment`

Target a specific deployment instead of the latest production deployment.

Accepts:

- Deployment ID: `dpl_ERiL45NJvP8ghWxgbvCM447bmxwV` or `ERiL45NJvP8ghWxgbvCM447bmxwV`
- Full deployment URL: `https://my-project-abc123.vercel.app`

### `--protection-bypass`

Provide a protection bypass secret for deployments with Vercel Protection enabled.

Alternatively, set the `VERCEL_AUTOMATION_BYPASS_SECRET` environment variable.

## Curl Arguments

Arguments after `--` are passed to the underlying curl command:

```bash
vercel httpstat /api/test -- -X POST -d '{"key": "value"}'
```

## Examples

### Basic Timing Analysis

```bash
vercel httpstat /api/hello
```

**Sample Output:**

```
Connected to my-project.vercel.app (76.76.21.21) port 443

HTTP/2 200
date: Mon, 15 Jan 2024 10:30:00 GMT
content-type: application/json

Body stored in: /tmp/httpstat-body.txt

  DNS Lookup   TCP Connection   TLS Handshake   Server Processing   Content Transfer
[    23ms    |     35ms       |     89ms       |      156ms        |       12ms      ]
             |                |                |                   |                  |
    namelookup:23ms           |                |                   |                  |
                        connect:58ms           |                   |                  |
                                    pretransfer:147ms              |                  |
                                                      starttransfer:303ms             |
                                                                                 total:315ms
```

### POST Request with Data

```bash
vercel httpstat /api/users -- \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"name": "John"}'
```

### Target a Specific Deployment

```bash
# Test a preview deployment
vercel httpstat /api/status --deployment preview-abc123.vercel.app

# Test by deployment ID
vercel httpstat /api/health --deployment ERiL45NJvP8ghWxgbvCM447bmxwV
```

### Custom Headers

```bash
vercel httpstat /api/test -- \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer token123" \
  -X PUT
```

### With Protection Bypass

```bash
vercel httpstat /api/protected \
  --protection-bypass your-secret-key
```

### Compare Deployments

```bash
# Test production
echo "Production:"
vercel httpstat /api/benchmark --deployment production-url.vercel.app

# Test preview
echo "Preview:"
vercel httpstat /api/benchmark --deployment preview-url.vercel.app
```

---

## Understanding the Output

### Timing Breakdown

| Phase             | Description                                          |
| ----------------- | ---------------------------------------------------- |
| DNS Lookup        | Time to resolve the domain name to an IP address     |
| TCP Connection    | Time to establish a TCP connection                   |
| TLS Handshake     | Time to complete the TLS/SSL handshake               |
| Server Processing | Time from request sent to first byte received (TTFB) |
| Content Transfer  | Time to download the response body                   |

### Key Metrics

| Metric        | Meaning                                |
| ------------- | -------------------------------------- |
| namelookup    | Cumulative time through DNS lookup     |
| connect       | Cumulative time through TCP connection |
| pretransfer   | Cumulative time through TLS handshake  |
| starttransfer | Cumulative time to first byte (TTFB)   |
| total         | Total request time                     |

### Interpreting Results

**Good Performance:**

- DNS Lookup: < 50ms (cached) or < 100ms (uncached)
- TCP Connection: < 50ms (same region)
- TLS Handshake: < 100ms
- Server Processing: < 200ms for simple API
- Content Transfer: Depends on payload size

**Warning Signs:**

- High DNS Lookup: DNS issues or cache miss
- High TCP Connection: Network latency or distant server
- High TLS Handshake: Certificate chain issues
- High Server Processing: Slow backend or cold start
- High Content Transfer: Large payload or slow connection

---

## Use Cases

### Performance Debugging

```bash
# Test cold start vs warm
echo "First request (potentially cold):"
vercel httpstat /api/function

sleep 1

echo "Second request (warm):"
vercel httpstat /api/function
```

### Region Comparison

```bash
# Test from different locations
echo "US East:"
vercel httpstat /api/test --deployment us-east-deployment.vercel.app

echo "EU West:"
vercel httpstat /api/test --deployment eu-west-deployment.vercel.app
```

### Endpoint Comparison

```bash
#!/bin/bash
# benchmark.sh - Compare endpoint performance

endpoints=("/api/users" "/api/products" "/api/orders")

for endpoint in "${endpoints[@]}"; do
  echo "Testing $endpoint:"
  vercel httpstat "$endpoint"
  echo "---"
done
```

### CI/CD Performance Gate

```yaml
# GitHub Actions - Fail if TTFB > 500ms
- name: Performance Check
  run: |
    TTFB=$(vercel httpstat /api/health 2>&1 | grep "starttransfer" | awk -F: '{print $2}' | tr -d 'ms')
    if [ "$TTFB" -gt 500 ]; then
      echo "TTFB too high: ${TTFB}ms"
      exit 1
    fi
```

---

## Requirements

- **httpstat** or **curl**: The command uses httpstat if available, otherwise falls back to curl with timing output
- **Vercel project**: Must be linked (`vercel link`)
- **Deployment**: At least one deployment must exist

### Installing httpstat

```bash
# macOS
brew install httpstat

# Python (cross-platform)
pip install httpstat

# Go version
go install github.com/davecheney/httpstat@latest
```

---

## See Also

- [curl](curl.md) - Execute curl with auto deployment URL
- [inspect](inspect.md) - Show deployment information
- [logs](logs.md) - View runtime logs
