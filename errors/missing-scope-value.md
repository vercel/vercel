# Missing Scope Value

#### Why This Error Occurred

The `--scope` flag was specified, but there's no value for it available.

#### Possible Ways to Fix It

In order to make it work, you need to specify a value for the `--scope` flag. This needs to be the slug or ID of the team as which you'd like to act or the username or ID of a user you'd like to act as.

As an example, if your team URL is `https://vercel.com/my-team`, you would set `--scope` to `my-team`.
