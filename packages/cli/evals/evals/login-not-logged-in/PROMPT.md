Explore how the Vercel CLI behaves when no credentials are available, then check the authenticated identity again using the available credentials.

Run one `vercel whoami` or `vc whoami` check with `VERCEL_TOKEN` removed from the command environment and save that output in `whoami-not-logged-in.txt`.

Then run `vercel whoami` or `vc whoami` with JSON output using the available credentials and save that JSON in `whoami-after-auth.json`.
