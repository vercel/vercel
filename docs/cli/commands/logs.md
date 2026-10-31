# vercel logs

Display runtime logs for a deployment.

## Synopsis

```bash
vercel logs <url|deploymentId> [options]
vercel log <url|deploymentId> [options]
```

## Description

The `logs` command streams real-time runtime logs from a deployment in ready state. Logs are displayed for up to 5 minutes.

## Aliases

- `log`

## Arguments

| Argument            | Required | Description          |
| ------------------- | -------- | -------------------- |
| `url\|deploymentId` | Yes      | Deployment URL or ID |

## Options

| Option   | Shorthand | Type    | Description                                  |
| -------- | --------- | ------- | -------------------------------------------- |
| `--json` | `-j`      | Boolean | Output each log line as JSON (JQ compatible) |

## Examples

### View Logs

```bash
vercel logs my-deployment-abc123.vercel.app
```

**Output:**

```
2024-01-15 10:30:15 [info] GET /api/users 200 45ms
2024-01-15 10:30:16 [info] POST /api/orders 201 120ms
2024-01-15 10:30:17 [warn] Slow query detected: 850ms
2024-01-15 10:30:18 [error] Failed to connect to database
```

### JSON Output

```bash
vercel logs my-deployment.vercel.app --json
```

**Output:**

```json
{"timestamp":"2024-01-15T10:30:15.000Z","level":"info","message":"GET /api/users","status":200,"duration":45}
{"timestamp":"2024-01-15T10:30:16.000Z","level":"info","message":"POST /api/orders","status":201,"duration":120}
```

### Filter with JQ

```bash
# Show only errors
vercel logs my-deployment.vercel.app --json | jq 'select(.level == "error")'

# Show only slow requests
vercel logs my-deployment.vercel.app --json | jq 'select(.duration > 500)'

# Extract specific fields
vercel logs my-deployment.vercel.app --json | jq '{time: .timestamp, msg: .message}'
```

### Log by Deployment ID

```bash
vercel logs dpl_abc123def456
```

---

## Log Levels

| Level   | Description                   |
| ------- | ----------------------------- |
| `info`  | Informational messages        |
| `warn`  | Warning messages              |
| `error` | Error messages                |
| `debug` | Debug messages (when enabled) |

---

## Log Duration

- Logs stream for up to **5 minutes**
- To view longer, restart the command
- Historical logs available in Vercel Dashboard

---

## Use Cases

### Debug Production Issues

```bash
# Stream logs while reproducing issue
vercel logs production-deployment.vercel.app
```

### Monitor Specific Deployment

```bash
# Monitor a preview deployment
vercel logs preview-abc123.vercel.app --json | tee logs.json
```

### CI/CD Log Collection

```yaml
- name: Collect Deployment Logs
  run: |
    timeout 60 vercel logs $DEPLOYMENT_URL --json > logs.json || true
```

---

## Comparison with Build Logs

| Log Type     | Command                 | Content            |
| ------------ | ----------------------- | ------------------ |
| Runtime Logs | `vercel logs`           | Function execution |
| Build Logs   | `vercel inspect --logs` | Build process      |

---

## See Also

- [inspect](inspect.md) - View build logs with `--logs`
- [deploy](deploy.md) - View build logs with `--logs`
