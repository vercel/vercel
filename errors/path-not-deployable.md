# Path Not Deployable

#### Why This Error Occurred

You either tried to run Now CLI inside a directory that should never be deployed, or you specified a directory that should never be deployed like this: `now <directory>`.

#### Possible Ways to Fix It

Make sure that you're not trying to deploy one of these directories:

- User
- Downloads
- Desktop

These directories are not supported for security reasons.
