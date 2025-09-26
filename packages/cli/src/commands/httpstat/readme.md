# httpstat

A modern HTTP timing analysis tool integrated with Vercel CLI. This command provides detailed timing breakdowns for HTTP requests to your Vercel deployments.

## Usage

```bash
vercel httpstat [path] [options]
```

## Features

- **HTTP/HTTPS Request Timing**: Detailed breakdown of DNS lookup, TCP connection, SSL handshake, server processing, and content transfer times
- **Visual Timeline**: ASCII art representation of request phases
- **Vercel Integration**: Automatic authentication and deployment protection bypass
- **Environment Targeting**: Test specific deployment environments
- **Flexible Output**: Human-readable or JSON format output

## Examples

### Basic Usage

```bash
# Test root path
vercel httpstat /

# Test API endpoint
vercel httpstat /api/users

# Test with custom method
vercel httpstat /api/data -X POST

# Add custom headers
vercel httpstat /api/auth -H "Authorization: Bearer token"

# Send data
vercel httpstat /api/create -d '{"name":"test"}' -H "Content-Type: application/json"
```

### Environment Targeting

```bash
# Target production
vercel httpstat /api/status --prod

# Target specific environment
vercel httpstat /api/data --environment preview
```

### Output Options

```bash
# Show response body
vercel httpstat /api/data --show-body

# JSON output for scripting
vercel httpstat /api/status --json-output

# Allow insecure connections
vercel httpstat https://example.com -k
```

## Options

- `-X, --method METHOD`: HTTP method to use (GET, POST, PUT, etc.)
- `-H, --header HEADER`: Add custom header (can be used multiple times)
- `-d, --data DATA`: HTTP request body data
- `--show-body`: Show response body in output
- `--json-output`: Output results in JSON format
- `-k, --insecure`: Allow insecure HTTPS connections
- `--prod`: Target the production environment
- `-e, --environment NAME`: Target specific environment
- `--cwd PATH`: Current working directory to resolve linked project from

## Output Format

The command provides a visual breakdown of HTTP timing:

```
HTTPS/1.1 200

   DNS Lookup   TCP Connection   SSL Handshake   Server Processing   Content Transfer
[    5ms   |      12ms   |       45ms    |        123ms   |        8ms    ]
             |                |                   |                  |                    |
    namelookup:5ms        |                   |                  |                    |
                        connect:17ms        |                  |                    |
                                    pretransfer:62ms          |                    |
                                                      starttransfer:185ms           |
                                                                                 total:193ms
```

## Integration with Vercel

The httpstat command automatically:

- Uses your logged-in Vercel account
- Adds deployment protection bypass tokens when needed
- Resolves project URLs from your linked project
- Supports all Vercel deployment environments

This tool is perfect for:

- Performance analysis of your APIs
- Debugging slow requests
- Monitoring deployment health
- Automated performance testing in CI/CD pipelines
