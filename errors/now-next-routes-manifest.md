# Routes Manifest Could Not Be Found

#### Why This Error Occurred

This could be caused by a misconfigured "Build Command" or "Output Directory" for your Next.js project.

#### Possible Ways to Fix It

In the Vercel dashboard, open your "Project Settings" and draw attention to "Build & Development Settings":

1. Ensure that the "Build Command" setting is not changed, or that it calls `next build`. If this command is not changed but you are seeing this error, double check that your `build` script in `package.json` calls `next build`.
2. Ensure that the "Output Directory" setting is not changed. This value almost never needs to be configured, and is only necessary if you override `distDir` in `next.config.js`.
3. For `next export` users: **do not override the "Output Directory"**. Next.js automatically detects what folder you outputted `next export` to.

In rare scenarios, this error message can also be caused by a Next.js build failure (if your "Build Command" accidentally returns an exit code that is not 0).
Double check for any error messages above the Routes Manifest error, which may provide additional details.
