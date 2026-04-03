# CI/CD Automation

## Authentication

Use `VERCEL_TOKEN` env var (not `--token` — it leaks in process listings). Use `--scope` if the token has access to multiple teams.

## The Standard CI Deploy Pattern

```bash
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

For multi-project monorepos, ensure `vercel link --repo --yes` has been run first.

## Separate Build and Deploy Jobs

Use `--standalone` so build artifacts are self-contained and can be passed between jobs:

```yaml
jobs:
  build:
    steps:
      - run: vercel pull --yes --environment=production
      - run: vercel build --prod --standalone
      - uses: actions/upload-artifact@v4
        with:
          name: vercel-build
          path: .vercel/output

  deploy:
    needs: build
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: vercel-build
          path: .vercel/output
      - run: vercel deploy --prebuilt --prod
```

Without `--standalone`, the deploy job will fail because artifacts reference files outside `.vercel/output/`.

## Capturing the Deploy URL

```bash
URL=$(vercel deploy --prod)   # stdout = URL, stderr = progress
```

## Key Rules

1. Always use `--yes` to skip prompts
2. Always use `VERCEL_TOKEN` env var for auth
3. Use `--scope` if the token has access to multiple teams
4. Use `vercel build` + `vercel deploy --prebuilt` for deterministic builds
5. If something goes wrong, check `.vercel/` — `project.json` vs `repo.json` is the most common issue
