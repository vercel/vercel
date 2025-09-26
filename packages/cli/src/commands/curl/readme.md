# `vercel curl`

Easily send curl requests to your Vercel Deployment.

Includes:

- Automatic deployment protection bypass (using the `VERCEL_OIDC_TOKEN` from environment variables or `.env*` files)
- Automatic URL detection (based on the environment)
- Support for targeting specific environments (production, preview, custom)
- Full curl compatibility - all curl options work as expected
