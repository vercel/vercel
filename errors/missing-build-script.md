# Missing Build Script

#### Why This Error Occurred

Your project's `package.json` is missing a `build` property inside the `scripts` property. Vercel runs the build script during deployment to produce the output that gets served.

#### Possible Ways to Fix It

Add a `build` script to the `scripts` section of your `package.json` that matches your framework's build command.

**Next.js:**

```json
{
  "scripts": {
    "build": "next build",
    "dev": "next dev"
  }
}
```

**React (Create React App):**

```json
{
  "scripts": {
    "build": "react-scripts build",
    "dev": "react-scripts start"
  }
}
```

**Vite:**

```json
{
  "scripts": {
    "build": "vite build",
    "dev": "vite"
  }
}
```

**Static site or no build step:** If your project does not require a build (e.g. static HTML), you can set `build` to a no-op:

```json
{
  "scripts": {
    "build": "echo 'No build step'"
  }
}
```

For more details, see [Build Step configuration](https://vercel.com/docs/build-step) in the Vercel documentation.
