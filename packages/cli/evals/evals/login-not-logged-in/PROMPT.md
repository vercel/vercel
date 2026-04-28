Explore how the Vercel CLI behaves when credentials are not available, then confirm the normal authenticated state when credentials are available.

First, simulate an unauthenticated CLI run by invoking `vercel whoami` or `vc whoami` with `VERCEL_TOKEN` unset and an isolated temporary home/config directory so existing auth files are not used. Save that output, including stderr if any, to `whoami-not-logged-in.txt`.

Then run the normal authenticated `vercel whoami --format=json` or `vc whoami --format=json` with the provided environment and save the successful JSON output to `whoami-after-auth.json`.

Do not open a browser. Do not run an interactive login flow unless it can complete non-interactively in this environment.
