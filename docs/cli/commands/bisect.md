# vercel bisect

Bisect deployments to find when a bug was introduced.

## Synopsis

```bash
vercel bisect [options]
```

## Description

The `bisect` command helps you find the deployment that introduced a bug by performing a binary search through your deployment history. Similar to `git bisect`, it efficiently narrows down the problematic deployment by testing deployments between a known good and known bad state.

## Options

| Option   | Shorthand | Type    | Description                                |
| -------- | --------- | ------- | ------------------------------------------ |
| `--bad`  | `-b`      | String  | Known bad deployment URL                   |
| `--good` | `-g`      | String  | Known good deployment URL                  |
| `--open` | `-o`      | Boolean | Automatically open each URL in the browser |
| `--path` | `-p`      | String  | Subpath to test on each deployment         |
| `--run`  | `-r`      | String  | Test script to run for each deployment     |

## Examples

### Interactive Bisect

```bash
vercel bisect
```

This launches an interactive session where you:

1. Are presented with a deployment URL
2. Test the deployment
3. Mark it as good or bad
4. Repeat until the problematic deployment is found

### Bisect with Known Endpoints

```bash
vercel bisect --bad example-abc123.vercel.app --good example-xyz789.vercel.app
```

This starts the bisect with:

- **Bad**: A deployment known to have the bug
- **Good**: A deployment known to work correctly

### Auto-Open in Browser

```bash
vercel bisect --open
```

Automatically opens each deployment URL in your default browser for manual testing.

### Test Specific Path

```bash
vercel bisect --path /api/users
```

Each deployment is tested at the specified path (e.g., `https://deployment-url.vercel.app/api/users`).

### Automated Bisect with Script

```bash
vercel bisect --run ./test-deployment.sh
```

Runs a test script for each deployment. The script receives the deployment URL as an argument and should exit with:

- `0` for good (no bug)
- Non-zero for bad (bug present)

---

## Test Script Interface

When using `--run`, your script receives:

| Argument | Description                |
| -------- | -------------------------- |
| `$1`     | The deployment URL to test |

### Example Test Script

```bash
#!/bin/bash
# test-deployment.sh

DEPLOYMENT_URL="$1"

# Test that the API returns expected data
response=$(curl -s "$DEPLOYMENT_URL/api/health")

if echo "$response" | grep -q '"status":"ok"'; then
  echo "✓ Deployment is good"
  exit 0
else
  echo "✗ Deployment is bad"
  exit 1
fi
```

### Advanced Test Script

```bash
#!/bin/bash
# comprehensive-test.sh

DEPLOYMENT_URL="$1"
FAILED=0

echo "Testing: $DEPLOYMENT_URL"

# Test 1: Health check
if ! curl -sf "$DEPLOYMENT_URL/api/health" > /dev/null; then
  echo "✗ Health check failed"
  FAILED=1
fi

# Test 2: Check for specific bug
response=$(curl -s "$DEPLOYMENT_URL/api/users/1")
if echo "$response" | grep -q '"error"'; then
  echo "✗ User endpoint has bug"
  FAILED=1
fi

# Test 3: Response time check
time=$(curl -o /dev/null -s -w '%{time_total}' "$DEPLOYMENT_URL/api/fast")
if (( $(echo "$time > 2.0" | bc -l) )); then
  echo "✗ Response too slow: ${time}s"
  FAILED=1
fi

exit $FAILED
```

---

## Workflow

### Manual Bisect Workflow

1. **Start bisect:**

   ```bash
   vercel bisect --bad production-broken.vercel.app
   ```

2. **For each presented deployment:**

   - Test the functionality
   - Enter `good` or `bad`

3. **Review the result:**

   ```
   Found! The first bad deployment is:

   URL:        example-abc123.vercel.app
   Created:    2024-01-15 14:30:00
   Commit:     feat: add new user endpoint
   Commit SHA: a1b2c3d4e5f6
   ```

### Automated Bisect Workflow

1. **Create test script:**

   ```bash
   cat > test.sh << 'EOF'
   #!/bin/bash
   curl -sf "$1/api/endpoint" | grep -q "expected"
   EOF
   chmod +x test.sh
   ```

2. **Run automated bisect:**

   ```bash
   vercel bisect --run ./test.sh \
     --bad broken.vercel.app \
     --good working.vercel.app
   ```

3. **Review automated results:**

   ```
   Bisecting: 8 deployments left to test
   Testing: example-mid123.vercel.app ... bad
   Bisecting: 4 deployments left to test
   Testing: example-mid456.vercel.app ... good
   Bisecting: 2 deployments left to test
   Testing: example-mid789.vercel.app ... bad

   Found! First bad deployment: example-mid789.vercel.app
   ```

---

## Use Cases

### Finding a Regression

When a feature that previously worked is now broken:

```bash
vercel bisect \
  --bad production.vercel.app \
  --good known-working-from-last-week.vercel.app \
  --path /feature/that/broke
```

### Performance Regression

Find when performance degraded:

```bash
#!/bin/bash
# perf-test.sh
time=$(curl -o /dev/null -s -w '%{time_total}' "$1/api/slow-endpoint")
if (( $(echo "$time > 1.0" | bc -l) )); then
  exit 1  # Bad - too slow
fi
exit 0  # Good - acceptable speed
```

```bash
vercel bisect --run ./perf-test.sh
```

### API Contract Changes

Find when an API response changed:

```bash
#!/bin/bash
# api-test.sh
response=$(curl -s "$1/api/users")
if echo "$response" | jq -e '.users[0].name' > /dev/null 2>&1; then
  exit 0  # Good - expected format
fi
exit 1  # Bad - format changed
```

```bash
vercel bisect --run ./api-test.sh --bad current.vercel.app
```

---

## Tips

1. **Start with wide range**: Begin with a definitely good and definitely bad deployment to maximize efficiency.

2. **Use automation**: For consistent bugs, automated testing is faster and more reliable.

3. **Test specific paths**: Use `--path` to focus on the affected functionality.

4. **Save time with `--open`**: For visual bugs, auto-opening saves manual URL copying.

5. **Combine with logs**: Once you find the bad deployment, use `vercel logs` to investigate.

---

## See Also

- [list](list.md) - List deployments
- [inspect](inspect.md) - Inspect a deployment
- [logs](logs.md) - View deployment logs
- [rollback](rollback.md) - Rollback to a working deployment
