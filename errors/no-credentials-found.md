# No Credentials Found

#### Why This Error Occurred

You're running Vercel CLI in a non-terminal context and there are no credentials available. This means that Vercel CLI is not able to authenticate against our service.

#### Possible Ways to Fix It

- Specify a value for the `--token` flag (this needs to be the token of the user account as which you'd like to act). You can either get the token from the `./vercel/auth.json` file located in your user directory or [from the dashboard](https://vercel.com/account/tokens).
- Ensure that both `~/vercel/auth.json` and `~/vercel/config.json` exist
