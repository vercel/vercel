---
'vercel': patch
---

Store the `coding-agents setup` API key in the macOS login Keychain instead of writing it into plaintext config files. When available it's used automatically: env-based agents resolve the key from the shell at runtime (a managed shell-rc block runs `security find-generic-password`), so the secret never lands in a config file. Pass `--no-keychain`, or run off macOS, to embed the key directly; it also falls back to embedding if the Keychain write fails.
