# Routes Manifest Could Not Be Found

#### Why This Error Occurred

This error occurs when the Next.js build output directory is missing, empty, or misconfigured. The most common causes are:

1. Misconfigured "Output Directory" in your project settings
2. Incorrect Turborepo cache configuration (missing the Next.js output in task outputs)
3. A failed or incomplete build

#### Possible Ways to Fix It

##### Check Your Output Directory Configuration

In the Vercel dashboard, open your "Project Settings" and check "Build & Development Settings":

1. Ensure that the "Build Command" setting is not overridden, or that it calls `next build`. If this command is not overridden but you are seeing this error, double check that your `build` script in `package.json` calls `next build`. If `buildCommand` exists in `vercel.json`, make sure it calls `next build`.
2. Ensure that the "Output Directory" setting is not overridden. This value almost never needs to be configured, and is only necessary if you override `distDir` in `next.config.js`. If `outputDirectory` exists in `vercel.json`, remove that property.
3. For `next export` users: **do not override the "Output Directory"**, even if you customized the `next export` output directory. It will automatically detect the correct output.

##### Check Your Turborepo Configuration (if applicable)

If you're using Turborepo, ensure your `turbo.json` includes the Next.js build output in the task outputs:

```json
{
  "tasks": {
    "build": {
      "outputs": [".next/**", "!.next/cache/**"]
    }
  }
}
```

If you've customized `distDir` in your `next.config.js`, replace `.next` with your custom directory name.

**Common Turborepo issues:**

- Missing `outputs` configuration causes the build artifacts to not be cached/restored properly
- Using `outputs: []` will exclude all outputs from the cache
- Forgetting to update `outputs` after changing `distDir` in Next.js config

##### Check for Build Failures

In rare scenarios, this error can be caused by a Next.js build failure (if your "Build Command" accidentally returns an exit code that is not 0).
Double check for any error messages above the Routes Manifest error, which may provide additional details.
