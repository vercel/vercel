# Guides and Setup

## Getting Started Guides

```bash
vercel integration guide <slug>                        # show setup guide
vercel integration guide <slug> --framework nextjs     # framework-specific (nextjs, remix, astro, nuxtjs, sveltekit)
vercel integration guide <slug>/<product>              # specific product of multi-product integration
```

## Pulling Environment Variables

After installing an integration, pull credentials to your local `.env` file:

```bash
vercel env pull                                        # pulls to .env.local
vercel env pull .env                                   # custom filename
```

This runs automatically after `vercel integration add` (unless `--no-env-pull` is set).

## Verifying Connection

```bash
vercel integration list                                # confirm resource is connected
```
