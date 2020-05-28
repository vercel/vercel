# Secret Not Found

#### Why This Error Occurred

You specified the `--env` or `-e` flag with the value of a secret. However, the secret doesn't exist in the current scope you're in.

#### Possible Ways to Fix It

Make sure to specify the environment variable and secret like that:

```bash
vercel -e VARIABLE_NAME=@secret-name
```

In addition, ensure that the secret (`@secret-name` in the example above) exists in the current scope (the team or user account that you're using).

You can run `vercel switch` or `--scope` to switch to a different team or user.
