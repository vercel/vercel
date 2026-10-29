# `@vercel/oidc-aws-credentials-provider`

Use `awsCredentialsProvider` to obtain STS credentials with Vercel OIDC.

## Immutable project identity

For AWS roles prepared to trust immutable Vercel project identities:

```typescript
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';

const credentials = awsCredentialsProvider({
  roleArn: process.env.AWS_ROLE_ARN!,
  enableProjectIdentity: true,
});
```

With this option, the provider exchanges the standard OIDC token at
`https://oidc.vercel.com/~aws-token` before calling STS. The role must trust
`aws-v1/owner/<team_id>/project/<project_id>/environment/<environment>`;
custom environments use `environment/custom/<environment_id>`. Exchange errors
stop credential creation, without falling back to the standard token.

The default remains the standard OIDC flow. The immutable identity option cannot
be combined with `audience` or `jti`. `skipTokenCache: true` bypasses the exchange
cache when enabled and does not change AWS credential caching.

Deploy the exchange and prepare IAM trust before enabling consumers. Preserve
existing trust until updated deployments are confirmed, then retire legacy trust
through the connection migration. An SDK upgrade alone does not change IAM grants.
