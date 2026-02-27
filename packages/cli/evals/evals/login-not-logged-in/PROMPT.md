Explore how the Vercel CLI behaves when you are not yet authenticated, and then sign in only if necessary.

1. First, try to find out which user (if any) the CLI thinks is currently signed in.
2. If that fails because there are no saved credentials, go through the normal sign‑in flow for the CLI and then check again who is signed in.
3. Copy the key lines that show what happened (the error when starting out unauthenticated, the moment you signed in, and the final identity the CLI reports) into `login-eval-log.txt`.

`login-eval-log.txt` should read like a short transcript of starting unauthenticated, signing in only if required, and confirming who is signed in at the end.
