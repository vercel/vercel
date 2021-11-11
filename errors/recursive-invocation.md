# Recursive invocation of the command

#### Why This Error Occurred

The Development/Build Command of the Project Settings or the `dev`/`build` script in `package.json` file of the used project invokes `vercel dev`/`vercel build` recursively.

#### Possible Ways to Fix It

Adjust the command/script to match what your framework uses to begin development mode, e.g. `next` for Next.js or `gatsby develop` for Gatsby.
