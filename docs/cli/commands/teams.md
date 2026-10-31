# vercel teams

Manage teams under your Vercel account.

## Synopsis

```bash
vercel teams <subcommand> [options]
vercel team <subcommand> [options]
vercel switch [name]
```

## Description

The `teams` command allows you to create, manage, and switch between teams.

## Aliases

- `team`
- `switch` (for switching teams)

## Subcommands

### `list` / `ls`

Show all teams you're a member of.

```bash
vercel teams list [options]
vercel teams ls [options]
```

#### Options

| Option   | Shorthand | Type   | Description          |
| -------- | --------- | ------ | -------------------- |
| `--next` | `-N`      | Number | Pagination timestamp |

#### Examples

```bash
vercel teams ls
vercel teams ls --next 1705312200000
```

**Output:**

```
Teams

  ID              Name              Role      Created
  team_abc123     My Company        owner     2024-01-01
  team_def456     Client Project    member    2024-02-15
  team_ghi789     Open Source       member    2024-03-01
```

---

### `add` / `create`

Create a new team.

```bash
vercel teams add
vercel teams create
```

Launches an interactive wizard to:

1. Choose team name
2. Select billing plan
3. Configure settings

#### Examples

```bash
vercel teams add
```

---

### `switch` / `change`

Switch to a different team context.

```bash
vercel teams switch [name]
vercel switch [name]
```

#### Arguments

| Argument | Required | Description                                  |
| -------- | -------- | -------------------------------------------- |
| `name`   | No       | Team slug (interactive selection if omitted) |

#### Examples

**Interactive switch:**

```bash
vercel teams switch
vercel switch
```

**Switch to specific team:**

```bash
vercel teams switch my-company
vercel switch my-company
```

**Switch to personal account:**

```bash
vercel switch
# Select personal account from list
```

---

### `invite`

Invite members to the current team.

```bash
vercel teams invite <email...>
```

#### Arguments

| Argument | Required | Description                 |
| -------- | -------- | --------------------------- |
| `email`  | Yes      | Email address(es) to invite |

#### Examples

**Interactive invite:**

```bash
vercel teams invite
```

**Invite single member:**

```bash
vercel teams invite colleague@example.com
```

**Invite multiple members:**

```bash
vercel teams invite user1@example.com user2@example.com user3@example.com
```

---

## Team Roles

| Role   | Permissions                                  |
| ------ | -------------------------------------------- |
| Owner  | Full access, billing, team deletion          |
| Member | Deploy, manage projects, view resources      |
| Viewer | Read-only access to projects and deployments |

---

## Scoped Commands

Most commands can be scoped to a specific team:

```bash
# Deploy to specific team
vercel deploy --scope my-team

# List projects for a team
vercel project ls --scope my-team

# Use team shorthand
vercel deploy -S my-team
vercel list -T my-team
```

---

## Team Identification

Teams can be identified by:

- **Slug**: The URL-friendly name (e.g., `my-company`)
- **ID**: The internal identifier (e.g., `team_abc123`)

Find team details:

```bash
vercel teams ls
```

---

## See Also

- [login](login.md) - Sign in
- [whoami](whoami.md) - Current user info
- [project](project.md) - Manage projects
