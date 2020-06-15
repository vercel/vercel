# Path Not Deployable

#### Why This Error Occurred

You either tried to run Vercel CLI inside a directory that should never be deployed, or you specified a directory that should never be deployed like this: `vercel <directory>`.

#### Possible Ways to Fix It

Make sure that you're not trying to deploy one of these directories:

- User
- Downloads
- Desktop

These directories are not supported for security reasons.
