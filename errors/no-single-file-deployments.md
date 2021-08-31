# No Single File Deployments

#### Why This Error Occurred

You attempted to create a Vercel deployment where the input is a file, rather than a directory. Previously this was allowed, however this behavior has been removed as of Vercel CLI vX.X.X because it exposed a potential security risk if the user accidentally created a deployment from a sensitive file.

#### Possible Ways to Fix It

- Run the `vercel deploy` command against a directory, instead of a file.
