---
'vercel': minor
---

Add stdin and pipe support to `vc blob put` command.

Usage:

```sh
cat file.txt | vc blob put --pathname file-from-stdin.txt
```
