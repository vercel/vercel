# Missing Token Value

#### Why This Error Occurred

The `--token` flag was specified, but there's no value for it available.

#### Possible Ways to Fix It

In order to make it work, you need to specify a value for the `--token` flag. This needs to be the token of the user account as which you'd like to act.

You can either get the token from the `./vercel/auth.json` file located in your user directory or [from the dashboard](https://vercel.com/account/tokens).
