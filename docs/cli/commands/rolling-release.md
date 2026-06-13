# vercel rolling-release

Manage your project's rolling release for gradual production deployments.

## Synopsis

```bash
vercel rolling-release <subcommand> [options]
vercel rr <subcommand> [options]
```

## Description

Rolling releases allow you to gradually roll out a new deployment to production by incrementally shifting traffic from the current production deployment to the new one. This helps minimize risk by allowing you to monitor the new deployment at each stage before fully promoting it.

Rolling releases support two advancement types:

- **Automatic**: Traffic automatically advances to the next stage after a specified duration
- **Manual Approval**: Each stage requires explicit approval before advancing

## Aliases

- `rr`

## Subcommands

### `configure`

Configure rolling release settings for a project.

```bash
vercel rolling-release configure [options]
vercel rr configure [options]
```

#### Options

| Option  | Type   | Description                                      |
| ------- | ------ | ------------------------------------------------ |
| `--cfg` | String | The project's rolling release configuration JSON |

#### Configuration Format

The `--cfg` option accepts a JSON string with the following structure:

```typescript
{
  "enabled": boolean,           // Enable or disable rolling releases
  "advancementType": string,    // "automatic" or "manual-approval"
  "stages": [
    {
      "targetPercentage": number,  // Traffic percentage (1-100)
      "duration": number           // Duration in minutes (automatic only)
    }
  ]
}
```

#### Examples

**Configure automatic rolling release with two stages:**

```bash
vercel rolling-release configure --cfg='{
  "enabled": true,
  "advancementType": "automatic",
  "stages": [
    {"targetPercentage": 10, "duration": 5},
    {"targetPercentage": 100}
  ]
}'
```

This configuration:

1. Routes 10% of traffic to the new deployment for 5 minutes
2. Automatically advances to 100% after 5 minutes

**Configure manual approval rolling release with three stages:**

```bash
vercel rolling-release configure --cfg='{
  "enabled": true,
  "advancementType": "manual-approval",
  "stages": [
    {"targetPercentage": 10},
    {"targetPercentage": 50},
    {"targetPercentage": 100}
  ]
}'
```

This configuration:

1. Routes 10% of traffic, requires approval to continue
2. Routes 50% of traffic, requires approval to continue
3. Routes 100% of traffic (full promotion)

**Disable rolling releases:**

```bash
vercel rolling-release configure --cfg='disable'
```

---

### `start`

Start a rolling release for a deployment.

```bash
vercel rolling-release start [options]
vercel rr start [options]
```

#### Options

| Option  | Type    | Required | Description                        |
| ------- | ------- | -------- | ---------------------------------- |
| `--dpl` | String  | Yes      | The deployment ID or URL to target |
| `--yes` | Boolean | No       | Skip confirmation prompt           |

#### Examples

**Start a rolling release by deployment ID:**

```bash
vercel rr start --dpl=dpl_123abc456def
```

**Start a rolling release by URL:**

```bash
vercel rr start --dpl=https://my-project-abc123.vercel.app
```

**Start without confirmation:**

```bash
vercel rr start --dpl=dpl_123abc456def --yes
```

---

### `approve`

Approve the current stage of an active rolling release to advance to the next stage.

```bash
vercel rolling-release approve [options]
vercel rr approve [options]
```

#### Options

| Option                | Type   | Required | Description                                  |
| --------------------- | ------ | -------- | -------------------------------------------- |
| `--dpl`               | String | Yes      | The deployment ID of the rolling release     |
| `--currentStageIndex` | String | Yes      | The current stage index to approve (0-based) |

#### Examples

**Approve the first stage (index 0):**

```bash
vercel rolling-release approve --currentStageIndex=0 --dpl=dpl_123abc456def
```

**Approve the second stage:**

```bash
vercel rr approve --currentStageIndex=1 --dpl=dpl_123abc456def
```

---

### `abort`

Abort an active rolling release and revert all traffic to the previous production deployment.

```bash
vercel rolling-release abort [options]
vercel rr abort [options]
```

#### Options

| Option  | Type   | Required | Description                              |
| ------- | ------ | -------- | ---------------------------------------- |
| `--dpl` | String | Yes      | The deployment ID of the rolling release |

#### Examples

**Abort a rolling release:**

```bash
vercel rolling-release abort --dpl=dpl_123abc456def
```

```bash
vercel rr abort --dpl=dpl_123abc456def
```

---

### `complete`

Complete an active rolling release immediately, promoting the deployment to 100% traffic.

```bash
vercel rolling-release complete [options]
vercel rr complete [options]
```

#### Options

| Option  | Type   | Required | Description                              |
| ------- | ------ | -------- | ---------------------------------------- |
| `--dpl` | String | Yes      | The deployment ID of the rolling release |

#### Examples

**Complete a rolling release:**

```bash
vercel rolling-release complete --dpl=dpl_123abc456def
```

```bash
vercel rr complete --dpl=dpl_123abc456def
```

---

### `fetch`

Fetch details about the current rolling release status for your project.

```bash
vercel rolling-release fetch
vercel rr fetch
```

#### Examples

**Fetch rolling release details:**

```bash
vercel rolling-release fetch
```

This displays:

- Current rolling release configuration
- Active rolling release status (if any)
- Stage information and traffic percentages

---

## Workflow Examples

### Automatic Rolling Release Workflow

1. **Configure automatic advancement:**

   ```bash
   vercel rr configure --cfg='{
     "enabled": true,
     "advancementType": "automatic",
     "stages": [
       {"targetPercentage": 10, "duration": 10},
       {"targetPercentage": 50, "duration": 15},
       {"targetPercentage": 100}
     ]
   }'
   ```

2. **Deploy your changes:**

   ```bash
   vercel deploy --prod
   ```

3. **Start the rolling release:**

   ```bash
   vercel rr start --dpl=<deployment-id>
   ```

4. **Monitor progress:**

   ```bash
   vercel rr fetch
   ```

   Traffic will automatically advance: 10% → 50% → 100%

### Manual Approval Workflow

1. **Configure manual approval:**

   ```bash
   vercel rr configure --cfg='{
     "enabled": true,
     "advancementType": "manual-approval",
     "stages": [
       {"targetPercentage": 10},
       {"targetPercentage": 100}
     ]
   }'
   ```

2. **Deploy and start rolling release:**

   ```bash
   vercel deploy --prod
   vercel rr start --dpl=<deployment-id>
   ```

3. **Monitor at 10% traffic, then approve:**

   ```bash
   # After verifying the deployment at 10%
   vercel rr approve --currentStageIndex=0 --dpl=<deployment-id>
   ```

4. **If issues are found, abort:**

   ```bash
   vercel rr abort --dpl=<deployment-id>
   ```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Deploy with Rolling Release
  run: |
    DEPLOYMENT_URL=$(vercel deploy --prod --yes)
    DEPLOYMENT_ID=$(vercel inspect $DEPLOYMENT_URL --json | jq -r '.id')
    vercel rr start --dpl=$DEPLOYMENT_ID --yes
```

---

## See Also

- [deploy](deploy.md) - Deploy your project
- [promote](promote.md) - Promote a deployment
- [rollback](rollback.md) - Rollback to a previous deployment
