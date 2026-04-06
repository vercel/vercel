---
'@vercel/cli': patch
---

Fixed `vercel env add <name> preview` prompting for a git branch when `--yes` and `--force` are used in non-interactive mode.

The command now correctly treats `--yes` and `--force` as non-interactive mode flags, preventing interactive prompts in CI/CD environments like GitHub Actions.

Example: this now works in non-interactive mode without hanging on prompts:
```bash
vercel env add MY_VAR preview --value "hello" --yes --force --token=$TOKEN
```
