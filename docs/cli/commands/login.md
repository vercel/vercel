# vercel login

Sign in to your Vercel account.

## Synopsis

```bash
vercel login [email-or-team-id]
```

## Description

The `login` command authenticates you with Vercel. After successful authentication, your credentials are stored locally for subsequent CLI operations.

## Arguments

| Argument           | Required | Description                               |
| ------------------ | -------- | ----------------------------------------- |
| `email-or-team-id` | No       | Email address or team ID for direct login |

## Authentication Methods

The CLI supports multiple authentication methods:

1. **Browser-based (default)**: Opens browser for OAuth login
2. **Email verification**: Sends verification email
3. **Token-based**: Use `--token` flag with existing token

## Examples

### Interactive Login

```bash
vercel login
```

Opens your browser for authentication.

### Login with Email

```bash
vercel login user@example.com
```

Sends a verification email.

### Login to Specific Team

```bash
vercel login team_abc123
```

---

## Token Authentication

For CI/CD environments, use token authentication:

```bash
# Set token via flag
vercel deploy --token $VERCEL_TOKEN

# Or via environment variable
export VERCEL_TOKEN=your-token
vercel deploy
```

### Creating a Token

1. Go to [vercel.com/account/tokens](https://vercel.com/account/tokens)
2. Click "Create Token"
3. Set scope and expiration
4. Copy the token

---

## Credential Storage

Credentials are stored in:

- **macOS/Linux**: `~/.vercel/auth.json`
- **Windows**: `%USERPROFILE%\.vercel\auth.json`

### Custom Config Location

```bash
vercel login --global-config ~/.vercel-alt
```

---

## CI/CD Integration

### GitHub Actions

```yaml
- name: Deploy to Vercel
  env:
    VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
  run: vercel deploy --token $VERCEL_TOKEN --yes
```

### Environment Variables

| Variable        | Description          |
| --------------- | -------------------- |
| `VERCEL_TOKEN`  | Authentication token |
| `VERCEL_ORG_ID` | Organization/Team ID |

---

## Multiple Accounts

To switch between accounts:

```bash
# Logout current account
vercel logout

# Login to different account
vercel login different@example.com
```

---

## Troubleshooting

### "Invalid credentials"

```bash
# Clear existing credentials
vercel logout

# Login again
vercel login
```

### Browser Doesn't Open

```bash
# Manual URL mode
vercel login --oob
# Deprecated but may work in some environments
```

### Token Issues

```bash
# Verify token works
vercel whoami --token $VERCEL_TOKEN
```

---

## See Also

- [logout](logout.md) - Sign out
- [whoami](whoami.md) - Show current user
- [teams](teams.md) - Manage teams
