# vercel microfrontends

Manage microfrontends configuration for your Vercel project.

## Synopsis

```bash
vercel microfrontends <subcommand> [options]
vercel mf <subcommand> [options]
```

## Description

Microfrontends allow you to build and deploy independent frontend applications that work together as a unified experience. The `microfrontends` command helps you manage configuration for microfrontend architectures on Vercel.

## Aliases

- `mf`

## Subcommands

### `pull`

Pull a Vercel Microfrontends configuration into your local project.

```bash
vercel microfrontends pull [options]
vercel mf pull [options]
```

#### Options

| Option  | Type   | Description                              |
| ------- | ------ | ---------------------------------------- |
| `--dpl` | String | Deployment ID to pull configuration from |

#### Description

This command retrieves the microfrontends configuration from Vercel and saves it locally. The configuration includes:

- Application routing rules
- Shared dependencies
- Module federation settings
- Cross-application communication setup

#### Examples

**Pull configuration for the linked project:**

```bash
vercel microfrontends pull
vercel mf pull
```

**Pull configuration from a specific deployment:**

```bash
vercel microfrontends pull --dpl=dpl_abc123def456
vercel mf pull --dpl=dpl_abc123def456
```

**Pull from a deployment URL:**

```bash
vercel mf pull --dpl=my-app-abc123.vercel.app
```

---

## Configuration Structure

When you pull a microfrontends configuration, it typically includes:

### Application Registry

Defines which applications are part of the microfrontend ecosystem:

```json
{
  "applications": [
    {
      "name": "shell",
      "route": "/",
      "remote": "shell@https://shell.example.com/remoteEntry.js"
    },
    {
      "name": "dashboard",
      "route": "/dashboard/*",
      "remote": "dashboard@https://dashboard.example.com/remoteEntry.js"
    },
    {
      "name": "settings",
      "route": "/settings/*",
      "remote": "settings@https://settings.example.com/remoteEntry.js"
    }
  ]
}
```

### Shared Dependencies

Specifies libraries shared across microfrontends to avoid duplication:

```json
{
  "shared": {
    "react": { "singleton": true, "requiredVersion": "^18.0.0" },
    "react-dom": { "singleton": true, "requiredVersion": "^18.0.0" },
    "@company/design-system": { "singleton": true }
  }
}
```

---

## Use Cases

### Development Workflow

1. **Pull the latest configuration:**

   ```bash
   vercel mf pull
   ```

2. **Start local development with the configuration:**

   ```bash
   vercel dev
   ```

3. **Deploy with updated configuration:**

   ```bash
   vercel deploy
   ```

### Deployment-Specific Configuration

When debugging issues with a specific deployment:

```bash
# Pull configuration from the problematic deployment
vercel mf pull --dpl=dpl_problematic123

# Compare with production configuration
vercel mf pull --dpl=dpl_production456
```

### CI/CD Integration

```yaml
# GitHub Actions example
jobs:
  deploy-microfrontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Pull Microfrontend Config
        run: |
          vercel link --yes
          vercel mf pull

      - name: Build with Config
        run: npm run build

      - name: Deploy
        run: vercel deploy --prod
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Shell Application                     │
│  (Routing, Navigation, Authentication)                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  Dashboard  │  │  Settings   │  │   Profile   │     │
│  │ Microfrontend│ │ Microfrontend│ │ Microfrontend│    │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│                                                         │
├─────────────────────────────────────────────────────────┤
│              Shared Dependencies Layer                   │
│  (React, Design System, State Management)                │
└─────────────────────────────────────────────────────────┘
```

Each microfrontend:

- Can be developed independently
- Has its own deployment pipeline
- Shares common dependencies via Module Federation
- Is composed at runtime by the shell application

---

## Best Practices

1. **Version your configuration**: Keep microfrontends configuration in version control alongside your code.

2. **Use deployment-specific pulls**: When debugging, pull configuration from the specific deployment showing issues.

3. **Sync before development**: Always pull the latest configuration before starting local development.

4. **Validate after changes**: After modifying the configuration, verify all microfrontends still work together.

---

## See Also

- [deploy](deploy.md) - Deploy your project
- [dev](dev.md) - Local development
- [pull](pull.md) - Pull project settings
- [link](link.md) - Link to a project
