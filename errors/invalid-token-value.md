# Invalid Token Value

#### Why This Error Occurred

The `--token` flag was specified, but its contents are invalid.

#### Possible Ways to Fix It

The `--token` flag must only contain numbers (0-9) and letters from the alphabet (a-z and A-Z). This needs to be the token of the user account as which you'd like to act.

You can either get the token from the `./vercel/auth.json` file located in your user directory or [from the dashboard](https://vercel.com/account/tokens).
