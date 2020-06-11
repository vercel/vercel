# No Token Allowed

#### Why This Error Occurred

You tried to run a command that doesn't allow the `--token` flag (like `vercel switch`). This is not allowed because commands like these are influencing the configuration files.

In turn, they would have to take the value of the `--token` flag into consideration (which is not a good idea, because flags in Vercel CLI should never change the configuration).

#### Possible Ways to Fix It

Specify a value for the `--scope` flag. This needs to be the slug or ID of the team as which you'd like to act (as an example, if your team URL is `https://vercel.com/my-team`, the value can be `my-team`) or the username or ID of a user you'd like to act as.
