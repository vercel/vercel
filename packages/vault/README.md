# @vercel/vault

Runtime Vault client for accessing secrets from Vercel Functions using OIDC authentication.

## Installation

```bash
npm install @vercel/vault
# or
pnpm add @vercel/vault
```

## Prerequisites

- Enable OIDC in your Vercel project settings
- Node.js >= 20

## Usage

### Basic Usage

```typescript
import { VaultClient } from '@vercel/vault';

export async function GET(request: Request) {
  const client = new VaultClient();

  // Fetch secret from production environment
  const secret = await client.getSecret('database-credentials');

  // Access secret data
  console.log(secret.data.username);
  console.log(secret.data.password);

  // Access metadata
  console.log(secret.metadata.version);
  console.log(secret.metadata.createdAt);

  return Response.json({ success: true });
}
```

### Global vs Project-Specific Secrets

```typescript
const client = new VaultClient();

// Project-specific secret (default - scoped to current project)
const projectSecret = await client.getSecret('api-key');

// Global secret (team-level secret, not scoped to a project)
const globalSecret = await client.getSecret('shared-api-key', {
  global: true,
});
```

### Environment-Specific Secrets

The SDK automatically uses the environment from your OIDC token (production, preview, or development). You can override this behavior:

```typescript
const client = new VaultClient();

// Uses environment from JWT token (or defaults to PRODUCTION if not available)
const secret = await client.getSecret('api-key');

// Explicitly specify PREVIEW environment
const previewSecret = await client.getSecret('api-key', {
  environment: 'PREVIEW',
});

// Explicitly specify DEVELOPMENT environment
const devSecret = await client.getSecret('api-key', {
  environment: 'DEVELOPMENT',
});
```

### Version Control

```typescript
const client = new VaultClient();

// Get specific version
const oldSecret = await client.getSecret('api-key', {
  version: 2,
});

// Latest version (default)
const latestSecret = await client.getSecret('api-key');
```

### Custom API Endpoint

```typescript
const client = new VaultClient({
  baseUrl: 'https://custom-api.vercel.com',
});

const secret = await client.getSecret('my-secret');
```

### Error Handling

```typescript
import {
  VaultClient,
  VaultNotFoundError,
  VaultAuthError,
  VaultTokenError,
  VaultApiError,
} from '@vercel/vault';

const client = new VaultClient();

try {
  const secret = await client.getSecret('my-secret');
  console.log(secret.data);
} catch (error) {
  if (error instanceof VaultNotFoundError) {
    console.error('Secret not found');
  } else if (error instanceof VaultAuthError) {
    console.error('Authentication failed:', error.message);
  } else if (error instanceof VaultTokenError) {
    console.error('OIDC token issue:', error.message);
  } else if (error instanceof VaultApiError) {
    console.error('API error:', error.code, error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## API Reference

### VaultClient

#### Constructor

```typescript
new VaultClient(config?: VaultClientConfig)
```

**Options:**

- `baseUrl` (optional): Custom API base URL. Default: `'https://api.vercel.com'`

#### getSecret()

```typescript
async getSecret(name: string, options?: GetSecretOptions): Promise<VaultSecretResponse>
```

Retrieves a secret from Vercel Vault.

**Parameters:**

- `name`: The path/name of the secret
- `options` (optional):
  - `environment`: Environment to fetch from (`'PRODUCTION'` | `'PREVIEW'` | `'DEVELOPMENT'`). Defaults to JWT token's environment, or `'PRODUCTION'` if not available
  - `version`: Specific version number to fetch. Default: latest
  - `global`: Set to `true` to fetch team-level (global) secrets instead of project-specific secrets. Default: `false`
  - `teamId`: Override auto-extracted team ID
  - `projectId`: Override auto-extracted project ID

**Returns:** Promise resolving to:

```typescript
{
  data: Record<string, unknown>; // Secret fields
  metadata: {
    version: number;
    createdAt: number;
  }
}
```

**Throws:**

- `VaultTokenError`: OIDC token missing or invalid
- `VaultNotFoundError`: Secret doesn't exist
- `VaultAuthError`: Authentication failed
- `VaultApiError`: Other API errors

## How It Works

1. The client automatically retrieves the OIDC token from your Vercel Function context
2. It extracts the `owner_id` (team ID) and `project_id` from the JWT claims
3. It uses the `environment` claim from the JWT token if not explicitly overridden
4. It makes an authenticated request to the Vault API
5. The API returns the plaintext secret data

## License

Apache-2.0
