# `vercel dev` as `dev` script

#### Why This Error Occurred

The `package.json` file of the used project invokes `vercel dev` as `dev` script. This would cause `vercel dev` to recursively invoke itself.

#### Possible Ways to Fix It

Adjust the `dev` script inside the `package.json` file to match what your framework uses to begin development mode, e.g. `next` for Next.js or `gatsby develop` for Gatsby.
