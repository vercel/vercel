# vercel upgrade

Upgrade the Vercel CLI to the latest version.

## Synopsis

```bash
vercel upgrade [options]
```

## Description

The `upgrade` command updates the Vercel CLI to the latest available version using your package manager.

## Options

| Option      | Type    | Description                                            |
| ----------- | ------- | ------------------------------------------------------ |
| `--dry-run` | Boolean | Show the upgrade command without executing             |
| `--json`    | Boolean | Output upgrade information as JSON (implies --dry-run) |

## Examples

### Upgrade CLI

```bash
vercel upgrade
```

### Preview Upgrade Command

```bash
vercel upgrade --dry-run
```

**Output:**

```
Would run: npm install -g vercel@latest
Current version: 33.0.0
Latest version: 33.1.0
```

### JSON Output

```bash
vercel upgrade --json
```

**Output:**

```json
{
  "current": "33.0.0",
  "latest": "33.1.0",
  "command": "npm install -g vercel@latest",
  "updateAvailable": true
}
```

---

## Package Manager Detection

The CLI detects how it was installed:

| Installation  | Upgrade Command                 |
| ------------- | ------------------------------- |
| npm (global)  | `npm install -g vercel@latest`  |
| yarn (global) | `yarn global add vercel@latest` |
| pnpm (global) | `pnpm add -g vercel@latest`     |
| npx           | Automatically uses latest       |

---

## Manual Upgrade

```bash
# npm
npm install -g vercel@latest

# yarn
yarn global add vercel@latest

# pnpm
pnpm add -g vercel@latest
```

---

## Check Current Version

```bash
vercel --version
```

---

## See Also

- [telemetry](telemetry.md) - Manage telemetry
