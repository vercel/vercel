# Missing Build Script

#### Why This Error Occurred

Your project's `package.json` file is missing a `build` script in the `scripts` property. Vercel requires this script to know how to build your application for production deployment.

When running `vercel dev`, the CLI validates that your project is properly configured for deployment, which includes having a build script defined.

#### Possible Ways to Fix It

Add a `build` script to the `scripts` property in your `package.json` file. The exact command depends on your framework:

**For Next.js:**
```json
{
  "scripts": {
    "build": "next build"
  }
}
```

**For React (Create React App):**
```json
{
  "scripts": {
    "build": "react-scripts build"
  }
}
```

**For Vite:**
```json
{
  "scripts": {
    "build": "vite build"
  }
}
```

**For other frameworks:**
Refer to your framework's documentation for the appropriate build command.

#### Additional Resources

- [Vercel Build Configuration](https://vercel.com/docs/deployments/configure-a-build)
- [Project Configuration](https://vercel.com/docs/projects/project-configuration)
