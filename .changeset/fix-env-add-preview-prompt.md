---
'@vercel/cli': patch
---

Fixed vercel env add preview command: always prompts for git branch even with --yes --force flags in non-interactive mode.

The command now correctly treats --yes and --force flags as non-interactive mode indicators, preventing interactive prompts in CI/CD environments like GitHub Actions.

Example fix - this now works without hanging on prompts:
```bash
vercel env add MY_VAR preview --value "hello" --yes --force --token=$TOKEN
```
