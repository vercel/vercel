# vercel logout

Sign out of your Vercel account.

## Synopsis

```bash
vercel logout
```

## Description

The `logout` command removes your stored authentication credentials from the local machine.

## Examples

### Sign Out

```bash
vercel logout
```

**Output:**

```
Logged out!
```

---

## What Gets Removed

- Authentication token from `~/.vercel/auth.json`
- Session credentials
- Team selection preferences

## What Remains

- Project links (`.vercel` directories)
- Global configuration
- Build caches

---

## Use Cases

### Switch Accounts

```bash
vercel logout
vercel login different@example.com
```

### Security

```bash
# Log out on shared machine
vercel logout
```

### Troubleshoot Auth Issues

```bash
vercel logout
vercel login
```

---

## See Also

- [login](login.md) - Sign in
- [whoami](whoami.md) - Show current user
