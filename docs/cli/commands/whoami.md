# vercel whoami

Show the currently logged in user.

## Synopsis

```bash
vercel whoami
```

## Description

The `whoami` command displays the username and email of the currently authenticated user.

## Examples

### Show Current User

```bash
vercel whoami
```

**Output:**

```
> myusername
```

### Verify Token

```bash
vercel whoami --token $VERCEL_TOKEN
```

---

## CI/CD Usage

Verify authentication before deployment:

```yaml
- name: Verify Auth
  run: vercel whoami --token ${{ secrets.VERCEL_TOKEN }}
```

---

## See Also

- [login](login.md) - Sign in
- [logout](logout.md) - Sign out
- [teams](teams.md) - Manage teams
