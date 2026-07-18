---
'vercel': patch
---

Improve `vercel ai-gateway coding-agents setup` prompts: use the searchable team picker, keep the multiselect key legend visible after the first selection, and narrow the prompt lines by moving context off the question line.

The apply step now offers a coding-agent handoff: when the key is stored in the macOS Keychain it asks whether to write the files or "Copy a prompt for my agent" (which creates the key, stores it in the Keychain, and copies agent-ready setup instructions — with no plaintext key — to the clipboard); without the Keychain it stays a plain yes/no confirm. A new `--apply <edit|prompt>` flag drives this non-interactively — `--apply prompt` writes the prompt to stdout so it can be piped into an agent (`… --apply prompt --yes | claude -p`), and in machine mode it rides along as a `prompt` JSON field.
