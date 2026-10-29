# `@vercel/functions`

Runtime functions to be used with your Vercel Functions.

Please [follow the documentation](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package) for examples and usage.

The legacy `awsCredentialsProvider` export from `@vercel/functions/oidc` also
accepts `enableProjectIdentity: true` for roles prepared to trust immutable AWS
project identities. New consumers should use
[`@vercel/oidc-aws-credentials-provider`](../oidc-aws-credentials-provider/README.md).
The option defaults to false; exchange failures never fall back to the standard
token. Prepare the exchange and IAM trust before enabling it.
