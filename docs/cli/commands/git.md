# vercel git

Manage Git repository connection for your Vercel project.

## Synopsis

```bash
vercel git <subcommand> [options]
```

## Description

The `git` command manages the connection between your Vercel project and a Git repository, enabling automatic deployments on push.

## Subcommands

### `connect`

Connect your Vercel project to a Git repository.

```bash
vercel git connect [git-url]
```

#### Arguments

| Argument  | Required | Description                                       |
| --------- | -------- | ------------------------------------------------- |
| `git-url` | No       | Git repository URL (uses local `.git` if omitted) |

#### Options

| Option      | Shorthand | Type    | Description                     |
| ----------- | --------- | ------- | ------------------------------- |
| `--yes`     | `-y`      | Boolean | Skip confirmation prompts       |
| `--confirm` | `-c`      | Boolean | Confirm the action (deprecated) |

#### Examples

**Connect using local Git config:**

```bash
vercel git connect
```

**Connect to specific repository:**

```bash
vercel git connect https://github.com/user/repo.git
vercel git connect git@github.com:user/repo.git
```

**Non-interactive connect:**

```bash
vercel git connect --yes
```

---

### `disconnect`

Disconnect the Git repository from your Vercel project.

```bash
vercel git disconnect
```

#### Options

| Option      | Shorthand | Type    | Description                     |
| ----------- | --------- | ------- | ------------------------------- |
| `--yes`     | `-y`      | Boolean | Skip confirmation prompts       |
| `--confirm` | `-c`      | Boolean | Confirm the action (deprecated) |

#### Examples

```bash
vercel git disconnect
vercel git disconnect --yes
```

---

## Supported Providers

| Provider  | URL Format                            |
| --------- | ------------------------------------- |
| GitHub    | `https://github.com/user/repo.git`    |
| GitLab    | `https://gitlab.com/user/repo.git`    |
| Bitbucket | `https://bitbucket.org/user/repo.git` |

---

## What Git Connection Enables

1. **Automatic Deployments**: Deploy on every push
2. **Preview Deployments**: Deploy on pull/merge requests
3. **Commit Metadata**: Commits linked to deployments
4. **Deploy Hooks**: CI/CD integration

---

## Workflow

### Initial Setup

```bash
# Link project
vercel link

# Connect Git repository
vercel git connect

# Deploy on every push
git push origin main
```

### Change Repository

```bash
# Disconnect current
vercel git disconnect --yes

# Connect new repository
vercel git connect https://github.com/newuser/newrepo.git
```

---

## See Also

- [link](link.md) - Link to a project
- [deploy](deploy.md) - Manual deployment
