# vercel build

Build the project locally.

## Synopsis

```bash
vercel build [options]
```

## Description

The `build` command executes your project's build process locally, creating output that can be deployed with `vercel deploy --prebuilt`. This enables:

- Faster deployments (skip remote build)
- Local build testing
- Custom CI/CD pipelines
- Build caching strategies

## Options

| Option         | Type    | Description                                            |
| -------------- | ------- | ------------------------------------------------------ |
| `--prod`       | Boolean | Build for production environment                       |
| `--target`     | String  | Specify target environment                             |
| `--output`     | String  | Directory for build output (default: `.vercel/output`) |
| `--yes`        | Boolean | Skip prompts for env vars and project settings         |
| `--standalone` | Boolean | Inline all dependencies into function output           |

## Examples

### Basic Build

```bash
vercel build
```

Creates build output in `.vercel/output/`.

### Production Build

```bash
vercel build --prod
```

Builds with production environment variables and settings.

### Build for Specific Target

```bash
vercel build --target staging
```

Builds using environment variables for the staging target.

### Custom Output Directory

```bash
vercel build --output ./build-output
```

### Build and Deploy

```bash
# Build locally
vercel build --prod

# Deploy prebuilt output
vercel deploy --prebuilt --prod
```

### Standalone Build

```bash
# Include all dependencies in output
vercel build --standalone
```

Creates self-contained function bundles with all dependencies inlined.

### Skip Prompts

```bash
# CI/CD friendly
vercel build --yes
```

---

## Build Output Structure

After running `vercel build`, the output directory contains:

```
.vercel/output/
├── config.json          # Build configuration
├── static/              # Static assets
│   ├── index.html
│   └── assets/
├── functions/           # Serverless functions
│   └── api/
│       └── hello.func/
│           ├── .vc-config.json
│           └── index.js
└── _buildManifest.json  # Build manifest
```

---

## Environment Variables

Build environment variables are loaded in this order:

1. `.env.local` (local overrides)
2. `.env.[target].local` (target-specific local)
3. `.env.[target]` (target-specific)
4. `.env` (base)
5. Vercel project environment variables (if linked)

### Pull Before Build

```bash
# Ensure latest env vars
vercel pull --environment production
vercel build --prod
```

---

## CI/CD Integration

### GitHub Actions

```yaml
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Dependencies
        run: npm ci

      - name: Pull Vercel Config
        run: vercel pull --yes --environment production
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}

      - name: Build
        run: vercel build --prod

      - name: Deploy
        run: vercel deploy --prebuilt --prod
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
```

### Custom Build Pipeline

```bash
#!/bin/bash
# custom-build.sh

# Pull latest config
vercel pull --yes

# Run custom pre-build steps
npm run prebuild
npm run lint
npm run test

# Build
vercel build --prod

# Run custom post-build steps
npm run postbuild

# Deploy
vercel deploy --prebuilt --prod
```

---

## Framework Support

The build command automatically detects and builds for supported frameworks:

| Framework   | Build Command           | Output Directory |
| ----------- | ----------------------- | ---------------- |
| Next.js     | `next build`            | `.next`          |
| React (CRA) | `react-scripts build`   | `build`          |
| Vue.js      | `vue-cli-service build` | `dist`           |
| Nuxt        | `nuxt build`            | `.nuxt`          |
| SvelteKit   | `svelte-kit build`      | `build`          |
| Astro       | `astro build`           | `dist`           |

---

## Troubleshooting

### "Environment variables not found"

```bash
# Pull environment variables first
vercel pull --yes
vercel build
```

### "Project not linked"

```bash
# Link to a project
vercel link
vercel build
```

### Build Errors

```bash
# Check build with verbose output
vercel build --debug
```

---

## See Also

- [deploy](deploy.md) - Deploy with `--prebuilt`
- [pull](pull.md) - Pull environment variables
- [dev](dev.md) - Local development
