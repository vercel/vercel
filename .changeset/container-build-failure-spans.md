---
'vercel': patch
'@vercel/container': patch
---

Emit build trace spans on failure. `vc build` previously only stopped the root
span and wrote the trace diagnostics file on the success path, so a failed build
returned through `finishWithExitCode` and dropped its entire trace — leaving the
Datadog trace empty. The trace is now flushed on both the success and error
paths (run once via a guard). Additionally, `@vercel/container`'s `withSpan`
records the error (`error`, `error.message`, `error.type`) on the span before
re-throwing, so a failed step such as a rejected container registry login is
distinguishable in the trace instead of looking like a successful span.
