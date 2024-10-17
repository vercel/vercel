# Routes Manifest Could Not Be Found

#### Why This Error Occurred

This error is often caused by a misconfigured "Build Command" or "Output Directory" for your Next.js project.

#### Possible Ways to Fix It

In the Vercel dashboard, open your "Project Settings" and draw attention to "Build & Development Settings":

1. Ensure that the "Build Command" setting is not overridden, or that it calls `next build`. If this command is not overridden but you are seeing this error, double check that your `build` script in `package.json` calls `next build`. If `buildCommand` exists in `vercel.json`, make sure it calls `next build`.
2. Ensure that the "Output Directory" setting is not overridden. This value almost never needs to be configured, and is only necessary if you override `distDir` in `next.config.js`. If `outputDirectory` exists in `vercel.json`, remove that property.
3. For `next export` users: **do not override the "Output Directory"**, even if you customized the `next export` output directory. It will automatically detects the correct output.
4. For turborepo users, ensure that your `turbo.json` file `pipeline.build.outputs` includes the `.next` directory.

In rare scenarios, this error message can also be caused by a Next.js build failure (if your "Build Command" accidentally returns an exit code that is not 0).
Double check for any error messages above the Routes Manifest error, which may provide additional details.
