# CI/CD Automation

> Exact syntax: `vercel deploy --help`, `vercel pull --help`, `vercel build --help`

Pass `--scope` when the token has access to multiple teams.

## The Standard CI Deploy Pattern

```bash
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

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
