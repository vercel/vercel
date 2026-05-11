---
'vercel': patch
---

Fix `vercel env add` truncating multiline values piped via stdin

`readStandardInput` used `stdin.once('data', resolve)` which only captured the first chunk of piped input. Multiline values (e.g. PEM private keys) were silently truncated to the first line. Now reads all chunks until the stream ends.
