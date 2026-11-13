---
"vercel": patch
---

fix(cli): read all piped stdin chunks before prompts in `env add`

Previously `readStandardInput` resolved on the first `data` chunk and
never waited for the stream to end.  On some systems the 500 ms timeout
could fire before any data was delivered, leaving `stdInput` empty.
When that happened the sensitive-type confirmation prompt was shown for
the production target, which consumed the piped bytes; the subsequent
value prompt then read EOF and silently stored an empty string.

The function now accumulates every chunk via `stdin.on('data')` and
resolves as soon as the stream emits `end` / `close`.  The 500 ms
timeout is kept as a safety valve for non-TTY interactive streams where
EOF never arrives.

Fixes: #16934
